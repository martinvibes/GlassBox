"""Risk-gate tests. The gate is the heart — it must NEVER fail open. These prove
the safety invariants: drawdown breaker fires, allowlist blocks, sizing clamps,
conviction floor holds, and unexpected errors fail SAFE (block), not open.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from glassbox.models import (
    Action,
    GateVerdict,
    Portfolio,
    Position,
    Regime,
    Signals,
    TradeProposal,
)
from glassbox.risk import gate as G
from glassbox.risk.gate import RiskState

NOW = datetime(2026, 6, 22, 12, 0, 0, tzinfo=timezone.utc)

RULEBOOK = {
    "capital": {"base_currency": "USDT", "starting_equity_usd": 1000.0},
    "drawdown": {"competition_cap_pct": 30.0, "internal_ceiling_pct": 12.0, "pause_after_breach_hours": 12},
    "sizing": {"max_position_pct": 25.0, "max_gross_exposure_pct": 60.0, "max_trade_pct": 15.0, "min_trade_usd": 25.0},
    "limits": {"max_trades_per_day": 6, "trade_cooldown_minutes": 30, "max_slippage_bps": 80},
    "conviction": {"min_score_to_enter": 0.62, "min_score_to_add": 0.72},
    "activity": {"min_trades_total": 7, "min_trades_per_day": 1, "activity_trade_max_pct": 3.0},
    "regimes": {
        "risk_off": {"max_gross_exposure_pct": 0.0},
        "neutral": {"max_gross_exposure_pct": 20.0},
        "risk_on": {"max_gross_exposure_pct": 50.0},
        "euphoria": {"max_gross_exposure_pct": 30.0},
    },
    "defaults": {"posture": "risk_off"},
    "_allowlist_symbols": {"USDT", "WBNB", "BTCB"},
}


def _signals(regime=Regime.RISK_ON, prices=None, tokens=None):
    return Signals(
        regime=regime,
        prices_usd=prices or {"WBNB": 600.0, "BTCB": 65000.0, "USDT": 1.0},
        tokens=tokens or {"WBNB": {"est_slippage_bps": 20}},
    )


def _flat_portfolio(cash=1000.0, hwm=1000.0):
    return Portfolio(base_currency="USDT", cash_usd=cash, positions={}, high_water_mark_usd=hwm)


def _buy(symbol="WBNB", size=10.0, conv=0.8):
    return TradeProposal(action=Action.BUY, symbol=symbol, size_pct=size, conviction=conv)


# ── drawdown circuit-breaker ──────────────────────────────────────────────
def test_drawdown_breach_flattens_when_holding():
    pf = Portfolio(
        base_currency="USDT", cash_usd=100.0,
        positions={"WBNB": Position(symbol="WBNB", qty=1.0, avg_price_usd=600.0)},
        high_water_mark_usd=1000.0,
    )
    # equity = 100 + 1*500 = 600 → dd = 40% ≥ 12% ceiling
    sig = _signals(prices={"WBNB": 500.0, "USDT": 1.0})
    d = G.evaluate(_buy(), pf, sig, RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.FLATTEN
    assert d.action == Action.SELL


def test_drawdown_breach_blocks_when_already_flat():
    pf = _flat_portfolio(cash=850.0, hwm=1000.0)  # dd = 15% ≥ ceiling, but flat
    d = G.evaluate(_buy(), pf, _signals(), RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.BLOCK


# ── allowlist ──────────────────────────────────────────────────────────────
def test_blocks_token_not_in_allowlist():
    d = G.evaluate(_buy(symbol="SCAM"), _flat_portfolio(), _signals(
        prices={"SCAM": 1.0, "USDT": 1.0}), RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.BLOCK
    assert any("allowlist" in r for r in d.reasons)


# ── conviction floor ───────────────────────────────────────────────────────
def test_blocks_below_conviction_floor():
    d = G.evaluate(_buy(conv=0.5), _flat_portfolio(), _signals(), RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.BLOCK
    assert any("conviction" in r for r in d.reasons)


# ── regime posture ─────────────────────────────────────────────────────────
def test_risk_off_blocks_new_buys():
    d = G.evaluate(_buy(), _flat_portfolio(), _signals(regime=Regime.RISK_OFF),
                   RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.BLOCK
    assert any("posture" in r for r in d.reasons)


def test_unknown_regime_defaults_to_risk_off_and_blocks():
    d = G.evaluate(_buy(), _flat_portfolio(), _signals(regime=Regime.UNKNOWN),
                   RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.BLOCK


# ── sizing clamps ──────────────────────────────────────────────────────────
def test_clamps_oversized_trade_to_max_trade_pct():
    # request 50% but max_trade is 15%, and neutral gross cap is 20%
    d = G.evaluate(_buy(size=50.0), _flat_portfolio(), _signals(regime=Regime.NEUTRAL),
                   RiskState(), RULEBOOK, NOW)
    assert d.verdict in (GateVerdict.CLAMP, GateVerdict.ALLOW)
    assert d.approved_size_pct <= 15.0 + 1e-9
    assert d.approved_notional_usd <= 150.0 + 1e-6


def test_allows_reasonable_buy_in_risk_on():
    d = G.evaluate(_buy(size=10.0), _flat_portfolio(), _signals(regime=Regime.RISK_ON),
                   RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.ALLOW
    assert abs(d.approved_notional_usd - 100.0) < 1e-6


# ── frequency / cooldown ───────────────────────────────────────────────────
def test_blocks_when_daily_cap_reached():
    st = RiskState()
    st.roll_day(NOW)
    st.trades_today = 6
    d = G.evaluate(_buy(), _flat_portfolio(), _signals(regime=Regime.RISK_ON),
                   st, RULEBOOK, NOW)
    assert d.verdict == GateVerdict.BLOCK
    assert any("daily trade cap" in r for r in d.reasons)


def test_cooldown_blocks_re_adding_same_name():
    # cooldown throttles re-trading the SAME held name (anti-churn)
    pf = Portfolio(
        base_currency="USDT", cash_usd=900.0,
        positions={"WBNB": Position(symbol="WBNB", qty=0.1, avg_price_usd=600.0)},
        high_water_mark_usd=1000.0,
    )
    st = RiskState()
    st.roll_day(NOW)
    st.last_trade_ts = NOW
    d = G.evaluate(_buy(symbol="WBNB", conv=0.8), pf, _signals(regime=Regime.RISK_ON),
                   st, RULEBOOK, NOW)
    assert d.verdict == GateVerdict.BLOCK
    assert any("cooldown" in r for r in d.reasons)


def test_cooldown_allows_new_name():
    # ...but must NOT block diversifying into a NEW name (portfolio building)
    st = RiskState()
    st.roll_day(NOW)
    st.last_trade_ts = NOW
    d = G.evaluate(_buy(symbol="WBNB"), _flat_portfolio(), _signals(regime=Regime.RISK_ON),
                   st, RULEBOOK, NOW)
    assert d.verdict in (GateVerdict.ALLOW, GateVerdict.CLAMP)
    assert not any("cooldown" in r for r in d.reasons)


# ── slippage ───────────────────────────────────────────────────────────────
def test_blocks_on_excess_slippage():
    sig = _signals(regime=Regime.RISK_ON, tokens={"WBNB": {"est_slippage_bps": 200}})
    d = G.evaluate(_buy(), _flat_portfolio(), sig, RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.BLOCK
    assert any("slippage" in r for r in d.reasons)


# ── sell path ──────────────────────────────────────────────────────────────
def test_sell_allowed_for_open_position():
    pf = Portfolio(
        base_currency="USDT", cash_usd=100.0,
        positions={"WBNB": Position(symbol="WBNB", qty=1.0, avg_price_usd=600.0)},
        high_water_mark_usd=700.0,
    )
    d = G.evaluate(TradeProposal(action=Action.SELL, symbol="WBNB"),
                   pf, _signals(prices={"WBNB": 600.0, "USDT": 1.0}),
                   RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.ALLOW
    assert d.action == Action.SELL


def test_sell_blocked_without_position():
    d = G.evaluate(TradeProposal(action=Action.SELL, symbol="WBNB"),
                   _flat_portfolio(), _signals(), RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.BLOCK


# ── hold ───────────────────────────────────────────────────────────────────
def test_hold_passes_through():
    d = G.evaluate(TradeProposal(action=Action.HOLD), _flat_portfolio(),
                   _signals(), RiskState(), RULEBOOK, NOW)
    assert d.verdict == GateVerdict.ALLOW
    assert d.action == Action.HOLD


# ── activity floor (≥1 trade/day or DQ) ─────────────────────────────────────
def test_needs_activity_trade_tracks_daily_floor():
    """The keep-alive backstop must trigger when we're under the daily floor and
    stop once we've traded — otherwise an idle day = inactivity DQ."""
    st = RiskState()
    st.roll_day(NOW)
    assert G.needs_activity_trade(st, RULEBOOK, NOW) is True   # 0 trades today
    st.record_trade(NOW)
    assert G.needs_activity_trade(st, RULEBOOK, NOW) is False  # floor satisfied
    # next day resets → floor applies again
    next_day = datetime(2026, 6, 23, 0, 0, 0, tzinfo=timezone.utc)
    assert G.needs_activity_trade(st, RULEBOOK, next_day) is True


def test_stable_swap_keepalive_passes_in_risk_off():
    """A tiny stable↔stable keep-alive swap must clear the gate even in risk_off
    (when volatile buys are blocked) so the ≥1-trade/day floor is always met with
    ZERO market exposure. This is the DQ-prevention path."""
    rb = {**RULEBOOK, "_allowlist_symbols": {"USDT", "USDC", "WBNB", "BTCB"}}
    pf = _flat_portfolio(cash=1000.0)
    sig = Signals(regime=Regime.RISK_OFF, prices_usd={"USDT": 1.0, "USDC": 1.0}, tokens={})
    swap = TradeProposal(action=Action.SWAP, symbol="USDT", to_symbol="USDC",
                         size_pct=3.0, conviction=1.0)
    d = G.evaluate(swap, pf, sig, RiskState(), rb, NOW)
    assert d.verdict in (GateVerdict.ALLOW, GateVerdict.CLAMP)
    assert d.action == Action.SWAP
    assert d.approved_notional_usd > 0


# ── fail-safe ──────────────────────────────────────────────────────────────
def test_gate_fails_safe_on_bad_input():
    # malformed rulebook (missing keys) must BLOCK, not raise
    d = G.evaluate(_buy(), _flat_portfolio(), _signals(), RiskState(), {"drawdown": {}}, NOW)
    assert d.verdict == GateVerdict.BLOCK
    assert any("fail-safe" in r.lower() for r in d.reasons)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
