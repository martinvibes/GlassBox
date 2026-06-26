"""Execution + exit-discipline tests.

These lock in the trading behavior the dashboard depends on:
  * paper swaps fill and return the (qty, price, realized) triple (regression: a
    2-vs-3 tuple mismatch once crashed the whole loop on the first real convert),
  * realized P&L is booked on closes,
  * the reasoner takes small profits and cuts losers deterministically.
"""

from __future__ import annotations

from datetime import datetime, timezone

from glassbox.config import load_settings
from glassbox.execution.twak import Executor
from glassbox.models import (
    Action,
    GateDecision,
    GateVerdict,
    Portfolio,
    Position,
    Regime,
    Signals,
)
from glassbox.reasoning.reasoner import Reasoner
from glassbox.storage import state as state_store

NOW = datetime(2026, 6, 22, 12, 0, 0, tzinfo=timezone.utc)


def _settings():
    s = load_settings(mode="paper")
    s.rulebook["_allowlist_symbols"] = set(s.allowlist.keys())
    return s


# ── paper swap arity (the crash regression) ────────────────────────────────
def test_apply_paper_swap_returns_triple():
    pf = Portfolio(base_currency="USDT", cash_usd=1000.0, positions={}, high_water_mark_usd=1000.0)
    out = state_store.apply_paper_swap(pf, "USDT", "USDC", 5.0, {"USDC": 1.0, "USDT": 1.0}, "USDT")
    assert len(out) == 3
    to_qty, to_price, realized = out
    assert to_qty > 0 and to_price > 0
    assert realized == 0.0  # converting out of cash books nothing


def test_executor_swap_fills_and_updates_book():
    ex = Executor(_settings())
    pf = Portfolio(base_currency="USDT", cash_usd=1000.0, positions={}, high_water_mark_usd=1000.0)
    dec = GateDecision(verdict=GateVerdict.ALLOW, action=Action.SWAP, symbol="USDC",
                       from_symbol="USDT", approved_notional_usd=5.0)
    res = ex.execute(dec, pf, {"USDC": 1.0, "USDT": 1.0})
    assert res.ok and res.action == Action.SWAP
    assert pf.cash_usd < 1000.0 and "USDC" in pf.positions


# ── realized P&L on a close ────────────────────────────────────────────────
def test_realized_pnl_booked_on_sell():
    ex = Executor(_settings())
    pf = Portfolio(base_currency="USDT", cash_usd=0.0,
                   positions={"WBNB": Position(symbol="WBNB", qty=1.0, avg_price_usd=600.0)},
                   high_water_mark_usd=1000.0)
    dec = GateDecision(verdict=GateVerdict.ALLOW, action=Action.SELL, symbol="WBNB",
                       approved_notional_usd=620.0)
    res = ex.execute(dec, pf, {"WBNB": 620.0})
    assert res.ok and res.realized_pnl_usd > 0                    # sold above cost basis
    assert abs(pf.realized_pnl_usd - res.realized_pnl_usd) < 0.01 # accumulated on the book (modulo rounding)
    assert "WBNB" not in pf.positions                            # position closed


# ── deterministic exits ────────────────────────────────────────────────────
def test_take_profit_fires_on_small_green():
    s = _settings()
    r = Reasoner(s)
    pf = Portfolio(base_currency="USDT", cash_usd=500.0,
                   positions={"ETH": Position(symbol="ETH", qty=1.0, avg_price_usd=600.0)},
                   high_water_mark_usd=1100.0)
    tp = float(s.rulebook["exits"]["take_profit_pct"])
    mark = 600.0 * (1 + (tp + 0.5) / 100.0)             # just past the take-profit line
    p = r.propose(Signals(regime=Regime.RISK_ON, prices_usd={"ETH": mark}), pf)
    assert p.action == Action.SELL and p.source == "exit:take_profit"


def test_stop_loss_fires_on_drawdown():
    s = _settings()
    r = Reasoner(s)
    pf = Portfolio(base_currency="USDT", cash_usd=500.0,
                   positions={"ETH": Position(symbol="ETH", qty=1.0, avg_price_usd=600.0)},
                   high_water_mark_usd=1100.0)
    sl = float(s.rulebook["exits"]["stop_loss_pct"])
    mark = 600.0 * (1 - (sl + 0.5) / 100.0)             # just past the stop-loss line
    p = r.propose(Signals(regime=Regime.RISK_ON, prices_usd={"ETH": mark}), pf)
    assert p.action == Action.SELL and p.source == "exit:stop_loss"


def test_stablecoin_holdings_are_not_churned():
    """A stablecoin position is cash-like — risk_off must not 'sell' it, and exits
    must not fire on it."""
    s = _settings()
    r = Reasoner(s)
    pf = Portfolio(base_currency="USDT", cash_usd=100.0,
                   positions={"USDC": Position(symbol="USDC", qty=200.0, avg_price_usd=1.0)},
                   high_water_mark_usd=1000.0)
    p = r.propose(Signals(regime=Regime.RISK_OFF, prices_usd={"USDC": 1.0}), pf)
    assert p.action == Action.HOLD
