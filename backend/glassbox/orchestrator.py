"""The orchestrator — GlassBox's heartbeat loop.

One cycle:
    perceive (CMC) → reason (LLM/heuristic) → GATE (deterministic) → execute (TWAK)
    → mark-to-market → record (JSONL) → anchor (ERC-8004, fail-soft)

The gate's decision is the ONLY thing that reaches execution. The model's proposal
is advisory. Survival first: the drawdown circuit-breaker can override everything.

CLI:
    glassbox --mode paper --once     # one cycle, then exit
    glassbox --mode paper            # continuous loop
    glassbox --mode live             # live (requires wired stacks + keys)
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timedelta, timezone

from glassbox.config import Settings, load_settings
from glassbox.execution.twak import Executor
from glassbox.models import (
    Action,
    DecisionRecord,
    GateVerdict,
    Signals,
    TradeProposal,
)
from glassbox.perception.cmc import CMCPerception
from glassbox.reasoning.reasoner import Reasoner
from glassbox.risk import gate as risk_gate
from glassbox.risk.gate import RiskState
from glassbox.storage import state as state_store
from glassbox.storage.log import AuditLog
from glassbox.verify.anchor import Anchor


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Orchestrator:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        self.perception = CMCPerception(settings)
        self.reasoner = Reasoner(settings)
        self.executor = Executor(settings)
        self.anchor = Anchor(settings)
        self.audit = AuditLog(settings.data_dir)
        self.portfolio = state_store.load_portfolio(settings)
        self.risk_state = RiskState()
        # expose allowlist symbols to the (pure) gate via the rulebook dict
        self.s.rulebook["_allowlist_symbols"] = set(settings.allowlist.keys())
        self.anchor.register_identity()

    # ── one heartbeat ────────────────────────────────────────────────────
    def run_cycle(self) -> DecisionRecord:
        now = _now()
        cycle_id = self.audit.next_cycle_id()

        # 1. perceive
        signals: Signals = self.perception.fetch()

        # 2. reason (proposal only)
        proposal: TradeProposal = self.reasoner.propose(signals, self.portfolio)

        # 2b. inactivity guard — if the competition's daily-activity floor isn't met
        #     and the model wants to HOLD, downgrade to a tiny keep-alive probe so we
        #     never get DQ'd for inactivity (only when a sane setup exists).
        if (
            proposal.action == Action.HOLD
            and risk_gate.needs_activity_trade(self.risk_state, self.s.rulebook, now)
        ):
            probe = self._activity_probe(signals)
            if probe is not None:
                proposal = probe

        # 3. GATE (the only authority over execution)
        decision = risk_gate.evaluate(
            proposal, self.portfolio, signals, self.risk_state, self.s.rulebook, now
        )

        # 4. execute (paper or TWAK)
        execution = self.executor.execute(decision, self.portfolio, signals.prices_usd)

        # 4b. update risk bookkeeping on a real fill
        if execution.ok and execution.action in (Action.BUY, Action.SELL):
            if execution.notional_usd > 0:
                self.risk_state.record_trade(now)
        # 4c. arm the pause window after a drawdown-breach flatten
        if decision.verdict == GateVerdict.FLATTEN:
            hours = self.s.rulebook["drawdown"]["pause_after_breach_hours"]
            self.risk_state.paused_until = now + timedelta(hours=hours)

        # 5. mark-to-market + persist portfolio
        equity = state_store.mark_to_market(self.portfolio, signals.prices_usd)
        dd = self.portfolio.drawdown_pct(signals.prices_usd)
        state_store.save_portfolio(self.s, self.portfolio)

        # 6. record (hash-chained JSONL)
        record = DecisionRecord(
            cycle_id=cycle_id,
            ts=now.isoformat(),
            signals=signals,
            proposal=proposal,
            decision=decision,
            execution=execution,
            equity_usd=round(equity, 2),
            drawdown_pct=round(dd, 3),
            prev_hash=self.audit.last_hash(),
        )
        # 7. anchor the decision hash (fail-soft) then persist
        record.anchor_tx = self.anchor.anchor(record.canonical_hash())
        self.audit.append(record)

        self._print_cycle(record)
        return record

    def _activity_probe(self, signals: Signals) -> TradeProposal | None:
        """A deliberately tiny keep-alive trade to satisfy the activity floor.
        Only in a non-risk_off regime, into the most liquid non-stable token."""
        from glassbox.models import Regime

        if signals.regime == Regime.RISK_OFF:
            return None
        candidates = [
            s for s, b in (signals.tokens or {}).items()
            if s in self.s.allowlist and not self.s.allowlist[s].is_stable
        ]
        if not candidates:
            return None
        sym = max(candidates, key=lambda s: signals.tokens[s].get("liquidity_usd", 0))
        size = self.s.rulebook["activity"]["activity_trade_max_pct"]
        return TradeProposal(
            action=Action.BUY, symbol=sym, size_pct=size,
            conviction=self.s.rulebook["conviction"]["min_score_to_enter"],
            rationale="activity-floor keep-alive probe (tiny, by design) to avoid inactivity DQ.",
            proposed_regime=signals.regime, source="activity_floor",
        )

    # ── loop ─────────────────────────────────────────────────────────────
    def run_forever(self) -> None:
        print(f"GlassBox running in {self.s.mode.upper()} mode "
              f"(heartbeat {self.s.heartbeat_seconds}s). Ctrl-C to stop.\n")
        try:
            while True:
                self.run_cycle()
                time.sleep(self.s.heartbeat_seconds)
        except KeyboardInterrupt:
            print("\nstopped.")

    # ── pretty cycle print ───────────────────────────────────────────────
    def _print_cycle(self, r: DecisionRecord) -> None:
        d, p, e = r.decision, r.proposal, r.execution
        verdict = d.verdict.value.upper()
        line = (
            f"#{r.cycle_id:<3} [{r.ts[11:19]}] regime={r.signals.regime.value:<8} "
            f"eq=${r.equity_usd:<9.2f} dd={r.drawdown_pct:>5.2f}%  "
            f"proposal={p.action.value}:{p.symbol or '-'}@{p.conviction:.2f} → "
            f"GATE={verdict}"
        )
        if e and e.ok and e.action in (Action.BUY, Action.SELL) and e.notional_usd > 0:
            line += f" → filled {e.action.value} {e.symbol} ${e.notional_usd:.2f} @ {e.fill_price_usd}"
        print(line)
        if d.reasons:
            print(f"      ↳ {d.reasons[0]}")


def main() -> None:
    ap = argparse.ArgumentParser(prog="glassbox", description="GlassBox autonomous trader")
    ap.add_argument("--mode", choices=["paper", "live"], default=None,
                    help="override GLASSBOX_MODE")
    ap.add_argument("--once", action="store_true", help="run a single cycle and exit")
    args = ap.parse_args()

    settings = load_settings(mode=args.mode)
    if settings.is_live:
        print("⚠️  LIVE mode. Ensure TWAK is running (`twak serve`) and keys are set.")
    orch = Orchestrator(settings)

    if args.once:
        orch.run_cycle()
    else:
        orch.run_forever()


if __name__ == "__main__":
    sys.exit(main())
