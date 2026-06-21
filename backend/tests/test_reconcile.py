"""Live wallet reconciliation: the portfolio must track real on-chain balances,
ignore gas/off-list tokens, and fail safe (never wipe the book on a bad read)."""
from __future__ import annotations

from glassbox.config import TokenInfo
from glassbox.models import Portfolio, Position
from glassbox.storage.state import reconcile_from_wallet

ALLOW = {
    "USDT": TokenInfo("USDT", "0x55d3", 18, True, "tether"),
    "USDC": TokenInfo("USDC", "0x8AC7", 18, True, "usd-coin"),
    "CAKE": TokenInfo("CAKE", "0x0E09", 18, False, "pancakeswap-token"),
}


def _rows():
    return [
        {"chain": "aptos", "symbol": "APT", "balance": "9", "usdValue": 50},   # other chain → ignore
        {"chain": "bsc", "type": "native", "symbol": "BNB", "balance": "0.004", "usdValue": 2.36},  # gas → ignore
        {"chain": "bsc", "type": "token", "symbol": "USDC", "balance": "10", "usdValue": 10},
    ]


def test_stables_become_cash_and_gas_is_ignored():
    pf = Portfolio(base_currency="USDT", cash_usd=999.0, high_water_mark_usd=1000.0)  # stale paper book
    assert reconcile_from_wallet(pf, _rows(), ALLOW) is True
    assert round(pf.cash_usd, 2) == 10.00      # USDC summed into cash; BNB/APT ignored
    assert pf.positions == {}
    assert round(pf.equity_usd({}), 2) == 10.00


def test_volatile_token_becomes_position_with_basis():
    pf = Portfolio(base_currency="USDT")
    rows = _rows() + [{"chain": "bsc", "type": "token", "symbol": "CAKE", "balance": "2", "usdValue": 5.0}]
    reconcile_from_wallet(pf, rows, ALLOW)
    assert pf.positions["CAKE"].qty == 2.0
    assert round(pf.positions["CAKE"].avg_price_usd, 2) == 2.50   # mark = usd/balance
    assert round(pf.equity_usd({}), 2) == 15.00


def test_held_position_keeps_cost_basis_on_reconcile():
    pf = Portfolio(base_currency="USDT",
                   positions={"CAKE": Position(symbol="CAKE", qty=2.0, avg_price_usd=2.00, peak_price_usd=3.0)})
    rows = _rows() + [{"chain": "bsc", "type": "token", "symbol": "CAKE", "balance": "2", "usdValue": 6.0}]
    reconcile_from_wallet(pf, rows, ALLOW)
    assert pf.positions["CAKE"].avg_price_usd == 2.00   # original entry basis preserved
    assert pf.positions["CAKE"].peak_price_usd == 3.0   # trailing peak preserved


def test_closed_position_is_dropped():
    pf = Portfolio(base_currency="USDT",
                   positions={"CAKE": Position(symbol="CAKE", qty=2.0, avg_price_usd=2.0)})
    reconcile_from_wallet(pf, _rows(), ALLOW)   # CAKE no longer on-chain
    assert "CAKE" not in pf.positions


def test_empty_read_is_failsafe_keeps_book():
    pf = Portfolio(base_currency="USDT", cash_usd=10.0)
    assert reconcile_from_wallet(pf, [], ALLOW) is False
    assert pf.cash_usd == 10.0   # not wiped
