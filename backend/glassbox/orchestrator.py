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

from glassbox import control
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

        # 0. live operator controls from the dashboard (read fresh each cycle)
        ctrl = control.read_control(self.s.data_dir)
        control.apply_mandate(self.s.rulebook, control.read_mandate(self.s.data_dir))
        paused = bool(ctrl.get("paused", False))
        mode = ctrl.get("mode", "autonomous")
        runtime = control.read_runtime(self.s.data_dir)

        # 1. perceive
        signals: Signals = self.perception.fetch()
        # Perception only quotes volatile tokens. Peg every allowlisted stablecoin
        # at $1 so the gate, paper-swap, and mark-to-market can value non-base
        # stables (e.g. USDC) — otherwise a USDC swap fails with "no mark price".
        for _sym, _tok in self.s.allowlist.items():
            if getattr(_tok, "is_stable", False):
                signals.prices_usd.setdefault(_sym, 1.0)
        equity = self.portfolio.equity_usd(signals.prices_usd)

        # 2. decide the proposal. A pending one-shot user command (manual trade /
        #    wallet convert) ALWAYS takes priority and executes regardless of mode.
        #    Otherwise the active mode drives: dca schedule, manual standby, or AI.
        if paused:
            # PAUSE stops NEW entries — but risk exits (stop-loss / trailing stop) STILL
            # fire, so a paused agent never lets an open loser blow past its stop.
            exit_proposal = self.reasoner._check_exits(signals, self.portfolio)
            proposal = exit_proposal or TradeProposal(
                action=Action.HOLD, conviction=0.0,
                rationale="paused by operator — standing down (risk exits still active).",
                proposed_regime=signals.regime, source="operator",
            )
        elif self._command_pending():
            proposal, runtime = self._manual_proposal(signals, equity, runtime)
        elif mode == "dca":
            proposal, runtime = self._dca_proposal(ctrl.get("dca", {}), signals, equity, now, runtime)
        elif mode == "manual":
            proposal = TradeProposal(
                action=Action.HOLD, conviction=0.0,
                rationale="manual mode — standing by for your trade.",
                proposed_regime=signals.regime, source="manual",
            )
        else:  # autonomous
            proposal = self.reasoner.propose(signals, self.portfolio)
            if (
                proposal.action == Action.HOLD
                and risk_gate.needs_activity_trade(self.risk_state, self.s.rulebook, now)
            ):
                probe = self._activity_probe(signals)
                if probe is not None:
                    proposal = probe

        control.write_runtime(self.s.data_dir, runtime)

        # 3. GATE (the only authority over execution)
        decision = risk_gate.evaluate(
            proposal, self.portfolio, signals, self.risk_state, self.s.rulebook, now
        )

        # 4. execute (paper or TWAK)
        execution = self.executor.execute(decision, self.portfolio, signals.prices_usd)

        # 4b. update risk bookkeeping on a real fill
        if execution.ok and execution.action in (Action.BUY, Action.SELL, Action.SWAP):
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
        Only when FLAT (real momentum trades already satisfy activity when deployed)
        and in a non-risk_off regime, into the most liquid non-stable token."""
        from glassbox.models import Regime

        if signals.regime == Regime.RISK_OFF:
            return None
        # already holding a volatile position → we're active; no keep-alive needed
        holds_volatile = any(
            s not in self.s.allowlist or not self.s.allowlist[s].is_stable
            for s in self.portfolio.positions
        )
        if holds_volatile:
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

    # ── manual mode: one-shot user command (buy/sell/flatten), gated ────────
    def _manual_proposal(self, signals, equity, runtime):
        cmd = control.read_command(self.s.data_dir)
        ts = cmd.get("ts")
        hold = TradeProposal(
            action=Action.HOLD, conviction=0.0, source="manual",
            rationale="manual mode — awaiting a command from the console.",
            proposed_regime=signals.regime,
        )
        if not ts or ts == runtime.get("command_last_ts"):
            return hold, runtime  # nothing new to do

        runtime["command_last_ts"] = ts
        action = str(cmd.get("action", "")).lower()
        symbol = str(cmd.get("symbol", "")).upper()

        if action == "swap":
            from_sym = str(cmd.get("from", "")).upper()
            to_sym = str(cmd.get("to", "")).upper()
            # prefer an absolute USD amount (convert-by-amount UI); fall back to %.
            amount_usd = float(cmd.get("amount_usd", 0.0) or 0.0)
            size_pct = float(cmd.get("size_pct", 0.0) or 0.0)
            if amount_usd > 0 and equity > 0:
                size_pct = amount_usd / equity * 100.0
                amt_note = f"${amount_usd:.2f}"
            else:
                amt_note = f"~{size_pct:.0f}% equity"
            return TradeProposal(
                action=Action.SWAP, symbol=from_sym, to_symbol=to_sym,
                size_pct=size_pct, conviction=1.0, directed=True,
                rationale=f"manual convert {from_sym} → {to_sym} ({amt_note}) from console.",
                proposed_regime=signals.regime, source="manual",
            ), runtime

        if action == "flatten":
            if not self.portfolio.positions:
                return hold, runtime
            sym = max(
                self.portfolio.positions,
                key=lambda s: self.portfolio.positions[s].value_usd(
                    signals.prices_usd.get(s, self.portfolio.positions[s].avg_price_usd)
                ),
            )
            return TradeProposal(
                action=Action.SELL, symbol=sym, size_pct=100.0, conviction=1.0, directed=True,
                rationale="manual FLATTEN from console — closing largest position.",
                proposed_regime=signals.regime, source="manual",
            ), runtime
        if action == "sell":
            return TradeProposal(
                action=Action.SELL, symbol=symbol, conviction=1.0, directed=True,
                rationale=f"manual SELL {symbol} from console.",
                proposed_regime=signals.regime, source="manual",
            ), runtime
        if action == "buy":
            size_pct = float(cmd.get("size_pct", 0.0))
            return TradeProposal(
                action=Action.BUY, symbol=symbol, size_pct=size_pct, conviction=1.0, directed=True,
                rationale=f"manual BUY {symbol} (~{size_pct:.1f}% equity) from console.",
                proposed_regime=signals.regime, source="manual",
            ), runtime
        return hold, runtime

    # ── DCA mode: recurring scheduled buy, gated ────────────────────────────
    def _dca_proposal(self, dca, signals, equity, now, runtime):
        token = str(dca.get("token", "")).upper()
        amount = float(dca.get("amount_usd", 0) or 0)
        interval_h = float(dca.get("interval_hours", 24) or 24)
        hold = TradeProposal(
            action=Action.HOLD, conviction=0.0, source="dca",
            rationale=f"DCA armed — next ${amount:.0f} buy of {token or '—'} pending interval.",
            proposed_regime=signals.regime,
        )
        if not token or amount <= 0:
            return TradeProposal(
                action=Action.HOLD, conviction=0.0, source="dca",
                rationale="DCA mode — configure a token and amount in the console.",
                proposed_regime=signals.regime,
            ), runtime

        last = runtime.get("dca_last_run")
        due = True
        if last:
            try:
                elapsed_h = (now - datetime.fromisoformat(last)).total_seconds() / 3600.0
                due = elapsed_h >= interval_h
            except ValueError:
                due = True
        if not due:
            return hold, runtime

        runtime["dca_last_run"] = now.isoformat()
        size_pct = (amount / equity * 100.0) if equity > 0 else 0.0
        return TradeProposal(
            action=Action.BUY, symbol=token, size_pct=size_pct, conviction=1.0, directed=True,
            rationale=f"DCA: scheduled ${amount:.0f} buy of {token} (every {interval_h:g}h).",
            proposed_regime=signals.regime, source="dca",
        ), runtime

    # ── loop ─────────────────────────────────────────────────────────────
    def _command_pending(self) -> bool:
        """True if a manual command from the console hasn't been consumed yet."""
        cmd = control.read_command(self.s.data_dir)
        ts = cmd.get("ts")
        if not ts:
            return False
        return ts != control.read_runtime(self.s.data_dir).get("command_last_ts")

    def _consume_pending_command(self) -> None:
        """Mark the current command consumed (used after a cycle error so a poison
        command can't retry-loop forever)."""
        cmd = control.read_command(self.s.data_dir)
        ts = cmd.get("ts")
        if ts:
            runtime = control.read_runtime(self.s.data_dir)
            runtime["command_last_ts"] = ts
            control.write_runtime(self.s.data_dir, runtime)

    def run_forever(self) -> None:
        print(f"GlassBox running in {self.s.mode.upper()} mode "
              f"(heartbeat {self.s.heartbeat_seconds}s, polling 5s). Ctrl-C to stop.\n")
        poll = 5.0
        last_heartbeat = 0.0
        try:
            while True:
                now = time.monotonic()
                due = (now - last_heartbeat) >= self.s.heartbeat_seconds
                # run immediately on a pending manual command, else on the heartbeat
                if due or self._command_pending():
                    try:
                        self.run_cycle()
                    except Exception as exc:  # one bad cycle must never kill the loop
                        import traceback
                        print(f"⚠ cycle error (continuing): {type(exc).__name__}: {exc}")
                        traceback.print_exc()
                        # a manual command is marked consumed inside run_cycle before
                        # execution, so a poison command won't retry-loop; but guard
                        # anyway by advancing the consumed marker.
                        self._consume_pending_command()
                    last_heartbeat = now
                time.sleep(poll)
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
    ap.add_argument("--dry-run", action="store_true",
                    help="live data + real quotes, but NEVER broadcast a swap")
    args = ap.parse_args()

    settings = load_settings(mode=args.mode)
    if args.dry_run:
        settings.dry_run = True
    if settings.is_live:
        if settings.dry_run:
            print("🧪 LIVE DRY-RUN: real quotes, NO on-chain swaps will be broadcast.")
        else:
            print("\n" + "=" * 64)
            print("⚠️  LIVE TRADING MODE — this BROADCASTS REAL ON-CHAIN SWAPS.")
            print("    The agent wallet will move real funds. Ctrl-C now to abort.")
            print("=" * 64 + "\n")
    orch = Orchestrator(settings)

    if args.once:
        orch.run_cycle()
    else:
        orch.run_forever()


if __name__ == "__main__":
    sys.exit(main())
