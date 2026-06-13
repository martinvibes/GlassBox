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
        if self._use_llm:
            try:
                return self._llm_propose(signals, portfolio)
            except Exception as exc:
                p = self._heuristic_propose(signals, portfolio)
                p.rationale = f"[LLM failed: {exc}; used heuristic] " + p.rationale
                p.source = "heuristic(fallback)"
                return p
        return self._heuristic_propose(signals, portfolio)

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

    # ── Heuristic backend (transparent, deterministic) ──────────────────────
    def _heuristic_propose(self, signals: Signals, portfolio: Portfolio) -> TradeProposal:
        # risk_off → de-risk: sell the largest open position, else hold.
        if signals.regime == Regime.RISK_OFF:
            if portfolio.positions:
                sym = max(
                    portfolio.positions,
                    key=lambda s: portfolio.positions[s].value_usd(
                        signals.prices_usd.get(s, portfolio.positions[s].avg_price_usd)
                    ),
                )
                return TradeProposal(
                    action=Action.SELL, symbol=sym, size_pct=100.0, conviction=0.9,
                    rationale="risk_off regime → de-risk: flatten largest position to stablecoin.",
                    proposed_regime=signals.regime, source="heuristic",
                )
            return TradeProposal(
                action=Action.HOLD, conviction=0.9,
                rationale="risk_off regime and already flat → stay in stablecoin.",
                proposed_regime=signals.regime, source="heuristic",
            )

        # otherwise: pick the highest-momentum allowlisted token with low slippage.
        best_sym, best_score = None, 0.0
        for sym, blob in (signals.tokens or {}).items():
            if sym not in self.s.allowlist or self.s.allowlist[sym].is_stable:
                continue
            mom = float(blob.get("momentum_24h", 0.0))
            # slippage is only known if a signal source provided it; when absent it
            # is quoted for real at execution time, so don't pre-filter on it here.
            slip = blob.get("est_slippage_bps")
            if mom <= 0:
                continue
            if slip is not None and float(slip) > self.s.rulebook["limits"]["max_slippage_bps"]:
                continue
            # conviction grows with momentum, dampened in non-risk_on regimes
            regime_mult = {
                Regime.RISK_ON: 1.0, Regime.NEUTRAL: 0.7,
                Regime.EUPHORIA: 0.5, Regime.UNKNOWN: 0.4,
            }.get(signals.regime, 0.4)
            score = min(0.95, 0.5 + mom * 8.0) * regime_mult
            if score > best_score:
                best_sym, best_score = sym, score

        if best_sym is None:
            return TradeProposal(
                action=Action.HOLD, conviction=0.6,
                rationale="no allowlisted token cleared the momentum/slippage bar → hold.",
                proposed_regime=signals.regime, source="heuristic",
            )

        size = min(self.s.rulebook["sizing"]["max_trade_pct"], 10.0)
        return TradeProposal(
            action=Action.BUY, symbol=best_sym, size_pct=size, conviction=round(best_score, 2),
            rationale=(
                f"{best_sym} leads on 24h momentum within slippage limits under "
                f"'{signals.regime.value}' regime; modest probe sized to be clamped safely."
            ),
            proposed_regime=signals.regime, source="heuristic",
        )
