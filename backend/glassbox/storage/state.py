"""Portfolio state: persistence + paper-fill bookkeeping + high-water-mark tracking.

The Portfolio is the same object in paper and live mode. In live mode it is
reconciled from on-chain balances (TODO: wire); in paper mode the fill helpers
below mutate it directly. The high-water mark is what the drawdown circuit-breaker
in the risk gate measures against, so we update it every cycle.
"""

from __future__ import annotations

import json
from pathlib import Path

from glassbox.config import Settings
from glassbox.models import Portfolio, Position


def _state_path(data_dir: Path) -> Path:
    return Path(data_dir) / "portfolio.json"


def load_portfolio(settings: Settings) -> Portfolio:
    path = _state_path(settings.data_dir)
    if path.exists():
        return Portfolio.model_validate_json(path.read_text())
    start = float(settings.rulebook["capital"]["starting_equity_usd"])
    return Portfolio(
        base_currency=settings.base_currency,
        cash_usd=start,
        positions={},
        high_water_mark_usd=start,
    )


def save_portfolio(settings: Settings, portfolio: Portfolio) -> None:
    path = _state_path(settings.data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(portfolio.model_dump(mode="json"), indent=2))


def mark_to_market(portfolio: Portfolio, prices_usd: dict[str, float]) -> float:
    """Update the high-water mark and return current equity."""
    eq = portfolio.equity_usd(prices_usd)
    if eq > portfolio.high_water_mark_usd:
        portfolio.high_water_mark_usd = eq
    return eq


# ── paper fills ─────────────────────────────────────────────────────────────
def apply_paper_buy(
    portfolio: Portfolio, symbol: str, qty: float, fill_price: float, notional: float
) -> None:
    """Spend `notional` cash, add `qty` of `symbol` at a blended avg price."""
    portfolio.cash_usd -= notional
    if symbol in portfolio.positions:
        pos = portfolio.positions[symbol]
        new_qty = pos.qty + qty
        if new_qty > 0:
            pos.avg_price_usd = (pos.qty * pos.avg_price_usd + qty * fill_price) / new_qty
        pos.qty = new_qty
    else:
        portfolio.positions[symbol] = Position(
            symbol=symbol, qty=qty, avg_price_usd=fill_price
        )


def apply_paper_sell(
    portfolio: Portfolio, symbol: str, qty: float, fill_price: float, proceeds: float
) -> None:
    """Remove up to `qty` of `symbol`, credit `proceeds` to cash."""
    portfolio.cash_usd += proceeds
    if symbol not in portfolio.positions:
        return
    pos = portfolio.positions[symbol]
    pos.qty -= qty
    if pos.qty <= 1e-12:
        del portfolio.positions[symbol]
