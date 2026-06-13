"""Live integration tests — exercise the real data + execution path end-to-end.

These hit real public APIs (CoinGecko + alternative.me), so they are skipped
automatically when there's no network. No mock data: prices are genuinely live.
The buy/flatten path is driven with REAL prices; only the regime label is set so
the test can exercise the deploy branch regardless of the day's actual regime.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from glassbox.config import load_settings
from glassbox.execution.twak import Executor
from glassbox.models import (
    Action, GateDecision, GateVerdict, Portfolio, Regime, Signals, TradeProposal,
)
from glassbox.perception.market import LiveMarketData
from glassbox.risk import gate as G
from glassbox.risk.gate import RiskState
from glassbox.storage import state as st


def _has_network() -> bool:
    import httpx

    try:
        httpx.get("https://api.coingecko.com/api/v3/ping", timeout=8).raise_for_status()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _has_network(), reason="no network for live APIs")


def test_live_market_data_is_real_and_sane():
    s = load_settings(mode="paper")
    sig = LiveMarketData(s).fetch()
    assert sig.source == "coingecko+fng"
    # base currency always priced at 1.0
    assert sig.prices_usd.get(s.base_currency) == 1.0
    # real non-stable prices present and positive
    assert sig.prices_usd.get("WBNB", 0) > 0
    assert sig.prices_usd.get("BTCB", 0) > 1000  # BTC is never < $1k
    # each token carries real momentum + liquidity
    for sym, blob in sig.tokens.items():
        assert "momentum_24h" in blob and "liquidity_usd" in blob
        assert blob["liquidity_usd"] >= 0


def test_live_dry_run_quotes_but_never_broadcasts():
    """Live dry-run hits the REAL TWAK swap quote but must never broadcast a tx.
    Skips if TWAK isn't installed/authenticated."""
    from glassbox.execution.twak import Executor
    from glassbox.execution.twak_cli import TwakCLI

    s = load_settings(mode="live")
    s.dry_run = True
    s.rulebook["_allowlist_symbols"] = set(s.allowlist.keys())
    if not TwakCLI(s).available() or not s.twak_access_id:
        pytest.skip("twak CLI not installed / not authenticated")

    d = GateDecision(
        verdict=GateVerdict.ALLOW, action=Action.BUY, symbol="WBNB",
        approved_size_pct=10, approved_notional_usd=100.0,
    )
    pf = Portfolio(base_currency="USDT", cash_usd=1000.0, high_water_mark_usd=1000.0)
    res = Executor(s).execute(d, pf, {"WBNB": 605.0, "USDT": 1.0})
    if not res.ok:
        pytest.skip(f"quote unavailable in this environment: {res.error}")
    assert res.tx_hash is None              # the safety guarantee: no broadcast
    assert "dry-run" in res.venue
    assert res.filled_qty > 0               # a real quote came back


def test_full_buy_then_flatten_against_real_prices():
    s = load_settings(mode="paper")
    s.rulebook["_allowlist_symbols"] = set(s.allowlist.keys())
    now = datetime.now(timezone.utc)

    live = LiveMarketData(s).fetch()
    prices = live.prices_usd
    assert prices.get("WBNB", 0) > 0

    # Build a risk_on view using the REAL prices (only the regime label is forced,
    # so the deploy branch runs regardless of today's actual regime).
    sig = Signals(regime=Regime.RISK_ON, prices_usd=prices, tokens=live.tokens)
    pf = Portfolio(base_currency=s.base_currency, cash_usd=1000.0, high_water_mark_usd=1000.0)
    execu = Executor(s)

    # BUY
    d = G.evaluate(
        TradeProposal(action=Action.BUY, symbol="WBNB", size_pct=10.0, conviction=0.8),
        pf, sig, RiskState(), s.rulebook, now,
    )
    assert d.verdict in (GateVerdict.ALLOW, GateVerdict.CLAMP)
    ex = execu.execute(d, pf, prices)
    assert ex.ok and ex.filled_qty > 0
    assert "WBNB" in pf.positions
    assert pf.cash_usd < 1000.0

    # SELL (flatten the position) at the same real mark
    d2 = G.evaluate(
        TradeProposal(action=Action.SELL, symbol="WBNB"),
        pf, sig, RiskState(), s.rulebook, now,
    )
    assert d2.verdict == GateVerdict.ALLOW
    ex2 = execu.execute(d2, pf, prices)
    assert ex2.ok
    assert "WBNB" not in pf.positions  # fully closed
    # round-trip cost (fees+slippage) means we end slightly below start — sane
    final_eq = st.mark_to_market(pf, prices)
    assert 970.0 < final_eq <= 1000.0
