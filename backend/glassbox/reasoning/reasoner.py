"""Reasoning layer — a single, auditable decision step.

This produces a `TradeProposal` (action + size + conviction + rationale). It is a
PROPOSAL only: the risk gate has the final say and the model never signs.

Two backends:
  * llm       — one structured Claude call (used when ANTHROPIC_API_KEY is set).
  * heuristic — a transparent, deterministic rule that runs with no API key, so
                paper mode always works and tests are reproducible.

Keep this layer THIN. No multi-agent circus, no meta-learner — over a 7-day / few-trade
window that only adds failure surface. The edge is discipline, not cleverness.
"""

from __future__ import annotations

import json

from glassbox.config import Settings
from glassbox.models import Action, Portfolio, Regime, Signals, TradeProposal

SYSTEM_PROMPT = """You are GlassBox, a disciplined autonomous trading agent on BNB Chain.
Your overriding objective in this competition is CAPITAL PRESERVATION: survive a 7-day
live PnL window without ever approaching the max-drawdown cap. Most competitors will
over-leverage and blow up; you win by being the one still standing with positive PnL.

Rules of engagement:
- Default to HOLD / staying in stablecoins. Only propose a BUY on genuine, multi-signal
  conviction (momentum + supportive regime + adequate liquidity).
- TAKE SMALL PROFITS. Don't swing for a moonshot — the moment a position is modestly
  green, bank it back to stablecoin. Banking many small wins beats one big bet over a
  few-trade window, and cash can't draw down. (Hard take-profit/stop-loss thresholds are
  also enforced deterministically before you even see this, so lean the same way.)
- In a risk_off regime, never propose new exposure. Propose SELL to de-risk.
- Size modestly. The risk gate will clamp you anyway; propose what's sensible.
- Output ONLY a JSON object: {"action","symbol","size_pct","conviction","rationale"}.
  action ∈ {buy,sell,hold}; size_pct is % of equity (0-15); conviction is 0..1.
- Your rationale is logged verbatim and shown to judges. Make it crisp and honest.
"""


class Reasoner:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        self._use_llm = bool(settings.anthropic_api_key)

    def propose(self, signals: Signals, portfolio: Portfolio) -> TradeProposal:
        # Exits come FIRST and are deterministic: a position past its take-profit or
        # stop-loss threshold is closed regardless of what the LLM/heuristic wants.
        # Banking small wins (and cutting losers early) is the whole survival thesis.
        exit_proposal = self._check_exits(signals, portfolio)
        if exit_proposal is not None:
            return exit_proposal

        if self._use_llm:
            try:
                return self._llm_propose(signals, portfolio)
            except Exception as exc:
                p = self._heuristic_propose(signals, portfolio)
                p.rationale = f"[LLM failed: {exc}; used heuristic] " + p.rationale
                p.source = "heuristic(fallback)"
                return p
        return self._heuristic_propose(signals, portfolio)

    # ── deterministic exits: take small profits, cut losers ─────────────────
    def _check_exits(self, signals: Signals, portfolio: Portfolio) -> TradeProposal | None:
        """Scan open positions; close any that hit the take-profit or stop-loss
        threshold. Stop-losses are prioritized over take-profits (survival first).
        Returns a SELL proposal for the most urgent position, or None."""
        ex = self.s.rulebook.get("exits", {})
        tp = float(ex.get("take_profit_pct", 0) or 0)
        sl = float(ex.get("stop_loss_pct", 0) or 0)
        if not portfolio.positions or (tp <= 0 and sl <= 0):
            return None

        losers: list[tuple[float, str]] = []
        winners: list[tuple[float, str]] = []
        for sym, pos in portfolio.positions.items():
            tok = self.s.allowlist.get(sym)
            if (tok and tok.is_stable) or pos.avg_price_usd <= 0:
                continue  # never "take profit" on a stablecoin
            mark = signals.prices_usd.get(sym, pos.avg_price_usd)
            pnl_pct = (mark - pos.avg_price_usd) / pos.avg_price_usd * 100.0
            if sl > 0 and pnl_pct <= -sl:
                losers.append((pnl_pct, sym))
            elif tp > 0 and pnl_pct >= tp:
                winners.append((pnl_pct, sym))

        if losers:  # cut the worst loser first
            pnl_pct, sym = min(losers)
            return TradeProposal(
                action=Action.SELL, symbol=sym, size_pct=100.0, conviction=0.95,
                rationale=(f"stop-loss: {sym} at {pnl_pct:+.2f}% ≤ −{sl:.1f}% threshold "
                           f"→ cut the loser back to stablecoin, well inside the DD ceiling."),
                proposed_regime=signals.regime, source="exit:stop_loss",
            )
        if winners:  # else bank the biggest winner
            pnl_pct, sym = max(winners)
            return TradeProposal(
                action=Action.SELL, symbol=sym, size_pct=100.0, conviction=0.95,
                rationale=(f"take-profit: {sym} at {pnl_pct:+.2f}% ≥ +{tp:.1f}% threshold "
                           f"→ bank the gain. A green trade is a closed trade."),
                proposed_regime=signals.regime, source="exit:take_profit",
            )
        return None

    # ── LLM backend ────────────────────────────────────────────────────────
    def _llm_propose(self, signals: Signals, portfolio: Portfolio) -> TradeProposal:
        from anthropic import Anthropic  # imported lazily; optional dependency

        client = Anthropic(api_key=self.s.anthropic_api_key)
        user_payload = {
            "signals": signals.model_dump(mode="json"),
            "portfolio": portfolio.model_dump(mode="json"),
            "rulebook_hint": {
                "max_trade_pct": self.s.rulebook["sizing"]["max_trade_pct"],
                "min_conviction_to_enter": self.s.rulebook["conviction"]["min_score_to_enter"],
            },
        }
        msg = client.messages.create(
            model=self.s.llm_model,
            max_tokens=600,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(user_payload)}],
        )
        text = "".join(block.text for block in msg.content if block.type == "text")
        return self._parse(text, signals, source="llm")

    @staticmethod
    def _parse(text: str, signals: Signals, source: str) -> TradeProposal:
        """Fail-safe parse: malformed model output → HOLD (never a wild trade)."""
        try:
            start, end = text.find("{"), text.rfind("}")
            data = json.loads(text[start : end + 1])
            action = Action(str(data.get("action", "hold")).lower())
            return TradeProposal(
                action=action,
                symbol=str(data.get("symbol", "")).upper(),
                size_pct=float(data.get("size_pct", 0.0)),
                conviction=float(data.get("conviction", 0.0)),
                rationale=str(data.get("rationale", ""))[:1000],
                proposed_regime=signals.regime,
                source=source,
            )
        except Exception as exc:
            return TradeProposal(
                action=Action.HOLD,
                conviction=0.0,
                rationale=f"unparseable model output → fail-safe HOLD ({exc})",
                proposed_regime=signals.regime,
                source=f"{source}(parsefail)",
            )

    # ── Heuristic backend: active, disciplined momentum rotation ─────────────
    def _heuristic_propose(self, signals: Signals, portfolio: Portfolio) -> TradeProposal:
        """Always try to hold the single strongest-momentum token, sized by the
        gate's regime posture, with take-profit / stop-loss exits (checked first,
        in `propose`) and the drawdown breaker doing the risk work. Only true
        capitulation (risk_off) stands the agent fully down."""

        def _is_stable(s: str) -> bool:
            tok = self.s.allowlist.get(s)
            return bool(tok and tok.is_stable)

        def _val(s: str) -> float:
            p = portfolio.positions[s]
            return p.value_usd(signals.prices_usd.get(s, p.avg_price_usd))

        volatile_held = [s for s in portfolio.positions if not _is_stable(s)]

        # 0. true capitulation → de-risk to stablecoin (never churn stables)
        if signals.regime == Regime.RISK_OFF:
            if volatile_held:
                sym = max(volatile_held, key=_val)
                return TradeProposal(
                    action=Action.SELL, symbol=sym, size_pct=100.0, conviction=0.9,
                    rationale="risk_off capitulation → flatten the largest position to stablecoin.",
                    proposed_regime=signals.regime, source="heuristic",
                )
            return TradeProposal(
                action=Action.HOLD, conviction=0.9,
                rationale="risk_off capitulation → rest in stablecoin until the tape stabilizes.",
                proposed_regime=signals.regime, source="heuristic",
            )

        # 1. rank allowlisted non-stable tokens by real 24h momentum (relative strength)
        ranked: list[tuple[float, str]] = []
        for sym, blob in (signals.tokens or {}).items():
            if sym not in self.s.allowlist or _is_stable(sym):
                continue
            slip = blob.get("est_slippage_bps")
            if slip is not None and float(slip) > self.s.rulebook["limits"]["max_slippage_bps"]:
                continue
            ranked.append((float(blob.get("momentum_24h", 0.0)), sym))
        if not ranked:
            return TradeProposal(
                action=Action.HOLD, conviction=0.6,
                rationale="no live token signals yet → hold cash for a cycle.",
                proposed_regime=signals.regime, source="heuristic",
            )
        ranked.sort(reverse=True)
        best_mom, best_sym = ranked[0]

        # 2. converge to a SINGLE name: sell anything we hold that isn't the current
        #    leader (one per cycle) so the book is always just the strongest mover
        laggards = [s for s in volatile_held if s != best_sym]
        if laggards:
            weak = max(laggards, key=_val)
            return TradeProposal(
                action=Action.SELL, symbol=weak, size_pct=100.0, conviction=0.85,
                rationale=(f"rotate: {weak} is no longer the momentum leader → sell to cash, "
                           f"concentrate into {best_sym} ({best_mom * 100:+.1f}% 24h)."),
                proposed_regime=signals.regime, source="heuristic",
            )

        # 3. already holding (only) the leader → let it ride; exits manage TP/SL
        if best_sym in volatile_held:
            return TradeProposal(
                action=Action.HOLD, conviction=0.7,
                rationale=(f"holding the momentum leader {best_sym} ({best_mom * 100:+.1f}% 24h) "
                           f"→ let it work; take-profit / stop-loss will manage the exit."),
                proposed_regime=signals.regime, source="heuristic",
            )

        # 4. flat → deploy a disciplined probe into the leader (conviction from
        #    relative strength; the gate clamps size to the regime posture)
        conviction = round(max(0.5, min(0.95, 0.66 + best_mom * 7.0)), 2)
        size = min(self.s.rulebook["sizing"]["max_trade_pct"], 12.0)
        ex = self.s.rulebook.get("exits", {})
        return TradeProposal(
            action=Action.BUY, symbol=best_sym, size_pct=size, conviction=conviction,
            rationale=(f"{best_sym} leads 24h momentum ({best_mom * 100:+.1f}%) under "
                       f"'{signals.regime.value}' → deploy a disciplined probe; "
                       f"take-profit +{ex.get('take_profit_pct', 1.5)}%, stop −{ex.get('stop_loss_pct', 3)}%."),
            proposed_regime=signals.regime, source="heuristic",
        )
