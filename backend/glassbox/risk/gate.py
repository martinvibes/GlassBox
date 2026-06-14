"""The deterministic risk gate — the heart of GlassBox.

THE LLM PROPOSES; THIS GATE DISPOSES. Nothing reaches the wallet without passing
through here. Design invariants:

  1. PURE. No network, no LLM, no file/env reads. Inputs in, decision out.
  2. DETERMINISTIC. Same inputs → same decision, always. Fully testable.
  3. FAIL-SAFE. Any unexpected error → BLOCK the trade, never fail open.

The gate's #1 job in this competition is to NEVER breach the drawdown cap. It
enforces an internal ceiling far inside the competition cap and emergency-flattens
the moment we approach it. Survival is the alpha.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from glassbox.models import (
    Action,
    GateDecision,
    GateVerdict,
    Portfolio,
    Signals,
    TradeProposal,
)


class RiskState:
    """Mutable, persisted risk bookkeeping the gate consults (counts, timers).

    Kept separate from the pure decision logic so the decision function stays
    a clean function of (proposal, portfolio, signals, state, rulebook)."""

    def __init__(self) -> None:
        self.trades_today: int = 0
        self.last_trade_ts: Optional[datetime] = None
        self.paused_until: Optional[datetime] = None
        self.day_key: str = ""

    def roll_day(self, now: datetime) -> None:
        key = now.strftime("%Y-%m-%d")
        if key != self.day_key:
            self.day_key = key
            self.trades_today = 0

    def record_trade(self, now: datetime) -> None:
        self.trades_today += 1
        self.last_trade_ts = now


def _posture_for(signals: Signals, rb: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Resolve the regime posture; default to the safest when unknown."""
    regimes = rb.get("regimes", {})
    default_posture = rb.get("defaults", {}).get("posture", "risk_off")
    regime = (signals.regime.value if signals and signals.regime else "unknown")
    if regime in regimes:
        return regime, regimes[regime]
    return default_posture, regimes.get(default_posture, {"max_gross_exposure_pct": 0.0})


def evaluate(
    proposal: TradeProposal,
    portfolio: Portfolio,
    signals: Signals,
    state: RiskState,
    rulebook: dict[str, Any],
    now: datetime,
) -> GateDecision:
    """Evaluate a proposal and return the binding decision. Fail-safe wrapper."""
    try:
        return _evaluate(proposal, portfolio, signals, state, rulebook, now)
    except Exception as exc:  # never fail open
        return GateDecision(
            verdict=GateVerdict.BLOCK,
            action=Action.HOLD,
            reasons=[f"gate error → fail-safe BLOCK: {type(exc).__name__}: {exc}"],
        )


def _evaluate(
    proposal: TradeProposal,
    portfolio: Portfolio,
    signals: Signals,
    state: RiskState,
    rb: dict[str, Any],
    now: datetime,
) -> GateDecision:
    prices = signals.prices_usd if signals else {}
    equity = portfolio.equity_usd(prices)
    dd = portfolio.drawdown_pct(prices)
    posture_name, posture = _posture_for(signals, rb)

    dd_rules = rb["drawdown"]
    sizing = rb["sizing"]
    limits = rb["limits"]
    conviction = rb["conviction"]

    base = GateDecision(
        verdict=GateVerdict.BLOCK,
        action=proposal.action,
        symbol=proposal.symbol,
        drawdown_pct=round(dd, 3),
        posture=posture_name,
    )

    # ── 0. DRAWDOWN CIRCUIT-BREAKER (highest priority) ────────────────────
    # If we've breached the internal ceiling, flatten everything and pause.
    if dd >= dd_rules["internal_ceiling_pct"]:
        if portfolio.positions:
            base.verdict = GateVerdict.FLATTEN
            base.action = Action.SELL
            base.reasons.append(
                f"DRAWDOWN BREACH {dd:.2f}% ≥ internal ceiling "
                f"{dd_rules['internal_ceiling_pct']}% → FLATTEN ALL + pause"
            )
            return base
        base.verdict = GateVerdict.BLOCK
        base.reasons.append(
            f"in drawdown {dd:.2f}% ≥ ceiling but already flat → hold, pause"
        )
        return base

    # ── 1. PAUSE WINDOW after a prior breach ─────────────────────────────
    if state.paused_until and now < state.paused_until:
        base.verdict = GateVerdict.BLOCK
        base.reasons.append(f"paused after breach until {state.paused_until.isoformat()}")
        return base

    # ── 2. HOLD short-circuit ────────────────────────────────────────────
    if proposal.action == Action.HOLD:
        base.verdict = GateVerdict.ALLOW
        base.action = Action.HOLD
        base.reasons.append("proposal is HOLD")
        return base

    # ── 3. SELL path — closing/reducing risk is (almost) always allowed ──
    if proposal.action == Action.SELL:
        if proposal.symbol not in portfolio.positions:
            base.verdict = GateVerdict.BLOCK
            base.reasons.append(f"cannot SELL {proposal.symbol}: no open position")
            return base
        pos = portfolio.positions[proposal.symbol]
        mark = prices.get(proposal.symbol, pos.avg_price_usd)
        notional = pos.value_usd(mark)
        base.verdict = GateVerdict.ALLOW
        base.approved_size_pct = (notional / equity * 100.0) if equity > 0 else 0.0
        base.approved_notional_usd = round(notional, 2)
        base.reasons.append(f"reduce-risk SELL of {proposal.symbol} (${notional:.2f})")
        return base

    # ── 4. BUY path — the disciplined gauntlet ───────────────────────────
    state.roll_day(now)

    # 4a. allowlist
    allowlist = rb.get("_allowlist_symbols")
    if allowlist is not None and proposal.symbol not in allowlist:
        base.reasons.append(f"BLOCK: {proposal.symbol} not in token allowlist")
        return base

    # 4b. price availability (can't size what we can't mark)
    mark = prices.get(proposal.symbol)
    if not mark or mark <= 0:
        base.reasons.append(f"BLOCK: no valid mark price for {proposal.symbol}")
        return base

    # Directed trades (user DCA / manual) skip the AI gates (conviction, regime
    # posture, cooldown) — but ALL hard safety below (drawdown breaker above,
    # sizing caps, allowlist, slippage, daily cap, cash) still applies.
    directed = bool(getattr(proposal, "directed", False))
    holding = proposal.symbol in portfolio.positions

    # 4c. conviction floor (higher bar to ADD to existing position)
    if not directed:
        floor = conviction["min_score_to_add"] if holding else conviction["min_score_to_enter"]
        if proposal.conviction < floor:
            base.reasons.append(
                f"BLOCK: conviction {proposal.conviction:.2f} < floor {floor} "
                f"({'add' if holding else 'enter'})"
            )
            return base

    # 4d. regime posture — risk_off means stay flat (AI trades only)
    posture_max_gross = float(posture.get("max_gross_exposure_pct", 0.0))
    if not directed and posture_max_gross <= 0.0:
        base.reasons.append(f"BLOCK: posture '{posture_name}' forbids new exposure")
        return base

    # 4e. trade-frequency (always) + cooldown (AI trades only)
    if state.trades_today >= limits["max_trades_per_day"]:
        base.reasons.append(
            f"BLOCK: daily trade cap reached ({state.trades_today}/{limits['max_trades_per_day']})"
        )
        return base
    if not directed and state.last_trade_ts is not None:
        gap_min = (now - state.last_trade_ts).total_seconds() / 60.0
        if gap_min < limits["trade_cooldown_minutes"]:
            base.reasons.append(
                f"BLOCK: cooldown {gap_min:.0f}m < {limits['trade_cooldown_minutes']}m"
            )
            return base

    # 4f. slippage guard (from per-token signal blob, if present)
    tok_sig = (signals.tokens or {}).get(proposal.symbol, {})
    est_slip = tok_sig.get("est_slippage_bps")
    if est_slip is not None and est_slip > limits["max_slippage_bps"]:
        base.reasons.append(
            f"BLOCK: est slippage {est_slip}bps > cap {limits['max_slippage_bps']}bps"
        )
        return base

    # 4g. SIZING — clamp the requested size down through every cap ─────────
    reasons: list[str] = []
    requested_pct = max(0.0, proposal.size_pct)
    size_pct = requested_pct

    if size_pct > sizing["max_trade_pct"]:
        reasons.append(f"clamp trade {size_pct:.1f}%→{sizing['max_trade_pct']}% (max_trade)")
        size_pct = sizing["max_trade_pct"]

    # cap by remaining room in this position
    cur_pos_val = (
        portfolio.positions[proposal.symbol].value_usd(mark) if holding else 0.0
    )
    cur_pos_pct = (cur_pos_val / equity * 100.0) if equity > 0 else 0.0
    room_in_position = max(0.0, sizing["max_position_pct"] - cur_pos_pct)
    if size_pct > room_in_position:
        reasons.append(
            f"clamp {size_pct:.1f}%→{room_in_position:.1f}% (max_position {sizing['max_position_pct']}%)"
        )
        size_pct = room_in_position

    # cap by remaining gross exposure room. AI trades respect the regime posture;
    # directed (DCA/manual) trades use the rulebook cap (posture-independent).
    gross_pct = (portfolio.gross_exposure_usd(prices) / equity * 100.0) if equity > 0 else 0.0
    gross_cap = sizing["max_gross_exposure_pct"] if directed else min(sizing["max_gross_exposure_pct"], posture_max_gross)
    room_in_gross = max(0.0, gross_cap - gross_pct)
    if size_pct > room_in_gross:
        label = "rulebook" if directed else f"under '{posture_name}'"
        reasons.append(f"clamp {size_pct:.1f}%→{room_in_gross:.1f}% (gross cap {gross_cap:.0f}% {label})")
        size_pct = room_in_gross

    # cap by available cash
    cash_pct = (portfolio.cash_usd / equity * 100.0) if equity > 0 else 0.0
    if size_pct > cash_pct:
        reasons.append(f"clamp {size_pct:.1f}%→{cash_pct:.1f}% (available cash)")
        size_pct = cash_pct

    notional = equity * size_pct / 100.0

    # 4h. minimum trade size — below this, fees dominate; don't bother
    if notional < sizing["min_trade_usd"]:
        base.reasons.append(
            f"BLOCK: clamped notional ${notional:.2f} < min ${sizing['min_trade_usd']}"
        )
        base.reasons.extend(reasons)
        return base

    base.verdict = GateVerdict.CLAMP if size_pct < requested_pct else GateVerdict.ALLOW
    base.approved_size_pct = round(size_pct, 3)
    base.approved_notional_usd = round(notional, 2)
    base.reasons.append(
        f"{'CLAMP' if base.verdict == GateVerdict.CLAMP else 'ALLOW'} BUY {proposal.symbol} "
        f"${notional:.2f} ({size_pct:.1f}% equity) under posture '{posture_name}'"
    )
    base.reasons.extend(reasons)
    return base


def needs_activity_trade(
    state: RiskState, rulebook: dict[str, Any], now: datetime
) -> bool:
    """True if we must place a tiny keep-alive trade to satisfy the competition's
    minimum-activity floor (≥1 trade/day). The orchestrator uses this to avoid a
    DQ for inactivity on quiet, risk-off days."""
    state.roll_day(now)
    floor = rulebook.get("activity", {}).get("min_trades_per_day", 0)
    return state.trades_today < floor
