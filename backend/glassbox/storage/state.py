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


def reconcile_from_wallet(
    portfolio: Portfolio,
    rows: list[dict],
    allowlist: dict,
    chain: str = "bsc",
    basis_hints: dict[str, float] | None = None,
) -> bool:
    """LIVE mode: refresh `portfolio` IN PLACE from real on-chain balances (the rows
    from `twak wallet portfolio --json`). Pure + testable; the orchestrator passes the
    parsed rows. Returns True if anything was reconciled, False if the rows were empty
    (caller should keep the last-known book rather than wipe it — fail-safe).

    Rules:
      * Stablecoins (USDT/USDC) → summed into cash_usd (base-currency balance).
      * Non-stable ALLOWLISTED tokens → positions (qty + USD mark from the wallet).
        Held names keep their cost basis / trailing peak; newly-seen names get basis =
        current mark. Names no longer on-chain are dropped (sold to dust).
      * Everything else (e.g. BNB held only for gas, or off-list tokens) is IGNORED —
        it is not tradeable equity, so it never inflates PnL or the drawdown gauge.
    """
    cash = 0.0
    stables: dict[str, float] = {}                     # sym -> USD held (per stablecoin)
    chain_tokens: dict[str, tuple[float, float]] = {}  # sym -> (qty, mark_usd)
    seen_any = False
    for r in rows:
        if r.get("chain") != chain:
            continue
        seen_any = True
        sym = r.get("symbol", "")
        try:
            bal = float(r.get("balance", 0) or 0)
            usd = float(r.get("usdValue", 0) or 0)
        except (TypeError, ValueError):
            continue
        if bal <= 0:
            continue
        tok = allowlist.get(sym)
        if tok is None:
            continue  # off-list (incl. gas BNB) → not tradeable equity
        if tok.is_stable:
            cash += usd
            stables[sym] = stables.get(sym, 0.0) + usd
        else:
            chain_tokens[sym] = (bal, (usd / bal) if bal else 0.0)
    if not seen_any:
        return False  # empty/failed read → keep last-known book (fail-safe)

    portfolio.cash_usd = round(cash, 6)
    portfolio.stable_balances = {k: round(v, 6) for k, v in stables.items()}
    hints = basis_hints or {}
    for sym, (qty, mark) in chain_tokens.items():
        if sym in portfolio.positions:
            pos = portfolio.positions[sym]
            pos.qty = qty
            if pos.avg_price_usd <= 0:
                pos.avg_price_usd = mark
            pos.peak_price_usd = max(pos.peak_price_usd or mark, mark)
        else:
            # New position: use the real fill price (basis_hint) if we have it, so PnL and
            # the stop reference the actual entry — not the price a cycle later.
            basis = float(hints.get(sym) or 0.0) or mark
            portfolio.positions[sym] = Position(
                symbol=sym, qty=qty, avg_price_usd=basis, peak_price_usd=mark
            )
    # drop volatile positions that are no longer on-chain (closed)
    for sym in list(portfolio.positions):
        tok = allowlist.get(sym)
        if (tok is None or not tok.is_stable) and sym not in chain_tokens:
            del portfolio.positions[sym]
    return True


# ── paper fills ─────────────────────────────────────────────────────────────
def apply_paper_buy(
    portfolio: Portfolio, symbol: str, qty: float, fill_price: float, notional: float
) -> None:
    """Spend `notional` cash (fees INCLUDED), add `qty` of `symbol`. The cost basis
    is the full cash outlay (`notional`), so realized P&L on the eventual sell is the
    true cash profit — buy-side fees are part of the basis, not silently dropped."""
    portfolio.cash_usd -= notional
    if qty <= 0:
        return
    if symbol in portfolio.positions:
        pos = portfolio.positions[symbol]
        new_qty = pos.qty + qty
        # blend by total cash spent: (existing basis + new outlay) / new qty
        pos.avg_price_usd = (pos.qty * pos.avg_price_usd + notional) / new_qty
        pos.qty = new_qty
    else:
        portfolio.positions[symbol] = Position(
            symbol=symbol, qty=qty, avg_price_usd=notional / qty
        )


def apply_paper_sell(
    portfolio: Portfolio, symbol: str, qty: float, fill_price: float, proceeds: float
) -> float:
    """Remove up to `qty` of `symbol`, credit `proceeds` to cash. Returns realized
    P&L (net `proceeds` minus the cost basis of the sold quantity)."""
    portfolio.cash_usd += proceeds
    if symbol not in portfolio.positions:
        return 0.0
    pos = portfolio.positions[symbol]
    realized = proceeds - qty * pos.avg_price_usd
    portfolio.realized_pnl_usd += realized
    pos.qty -= qty
    if pos.qty <= 1e-12:
        del portfolio.positions[symbol]
    return realized


def apply_paper_swap(
    portfolio: Portfolio,
    from_sym: str,
    to_sym: str,
    usd: float,
    prices: dict[str, float],
    base_currency: str,
    fee_bps: float = 25,
    slip_bps: float = 8,
) -> tuple[float, float, float]:
    """Generic paper swap of `usd` worth of `from_sym` into `to_sym`. Handles
    base→token, token→base, and token→token uniformly. Returns
    (to_qty, to_price, realized_pnl) — realized is booked when the FROM leg is a
    token being sold (its proceeds vs cost basis); 0 when converting out of cash."""
    from_price = 1.0 if from_sym == base_currency else prices.get(from_sym, 0.0)
    to_price = 1.0 if to_sym == base_currency else prices.get(to_sym, 0.0)
    if from_price <= 0 or to_price <= 0 or usd <= 0:
        return 0.0, to_price, 0.0

    realized = 0.0
    if from_sym == base_currency:
        portfolio.cash_usd -= usd
    else:
        pos = portfolio.positions.get(from_sym)
        if pos:
            sold_qty = usd / from_price
            realized = usd - sold_qty * pos.avg_price_usd
            portfolio.realized_pnl_usd += realized
            pos.qty -= sold_qty
            if pos.qty <= 1e-12:
                del portfolio.positions[from_sym]

    fee = usd * fee_bps / 10_000
    net = usd - fee
    eff_to_price = to_price * (1 + slip_bps / 10_000)
    to_qty = net / eff_to_price

    if to_sym == base_currency:
        portfolio.cash_usd += net
    elif to_qty > 0:
        # cost basis of the acquired token = the FULL `usd` value given up (fee
        # included), so a later sell books the true cash P&L.
        existing = portfolio.positions.get(to_sym)
        if existing:
            new_qty = existing.qty + to_qty
            existing.avg_price_usd = (existing.qty * existing.avg_price_usd + usd) / new_qty
            existing.qty = new_qty
        else:
            portfolio.positions[to_sym] = Position(symbol=to_sym, qty=to_qty, avg_price_usd=usd / to_qty)
    return to_qty, eff_to_price, realized
