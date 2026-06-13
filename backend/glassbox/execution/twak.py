"""Execution layer — Trust Wallet Agent Kit (TWAK).

TWAK is the MANDATORY execution path for Track 1: local self-custody signing,
autonomous operation mode, on-chain execution on BSC (PancakeSwap spot first;
perps later, carefully). Setup:

    npm i -g @trustwallet/cli                       # provides `twak`
    # create an app + API key at portal.trustwallet.com → Access ID + HMAC Secret
    export TWAK_ACCESS_ID=...  TWAK_HMAC_SECRET=...  # (also saved to ~/.twak/)
    twak wallet create --password "<pw>"            # the agent's own wallet, then fund it

Two backends:
  * twak  — REAL swaps via the `twak` CLI (HMAC auth + local signing). See twak_cli.py.
  * paper — fill simulator against REAL live prices, so the full loop runs end-to-end
            with no wallet and no funds. (Real prices, simulated fills.)

SECURITY: keys live in the TWAK keystore (~/.twak/); the private key never touches
this process. The wallet password is read from env and never logged.
"""

from __future__ import annotations

import hashlib

from glassbox.config import Settings
from glassbox.execution.twak_cli import TwakCLI, bsc_asset_id
from glassbox.models import Action, ExecutionResult, GateDecision, GateVerdict, Portfolio
from glassbox.storage import state as state_store

# Paper-trading cost model (tune to BSC reality).
_PAPER_FEE_BPS = 25      # ~0.25% round-trip-ish per leg (PancakeSwap + gas proxy)
_PAPER_SLIP_BPS = 8      # baseline adverse slippage applied to the mark


class Executor:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        self.cli = TwakCLI(settings)

    def execute(
        self, decision: GateDecision, portfolio: Portfolio, prices_usd: dict[str, float]
    ) -> ExecutionResult:
        if decision.verdict == GateVerdict.BLOCK or decision.action == Action.HOLD:
            return ExecutionResult(ok=True, action=Action.HOLD, venue="none")

        if self.s.is_live and self.s.twak_access_id:
            try:
                return self._twak_execute(decision, portfolio, prices_usd)
            except Exception as exc:
                return ExecutionResult(
                    ok=False, action=decision.action, symbol=decision.symbol,
                    venue="pancakeswap", error=f"TWAK execution failed: {exc}",
                )
        return self._paper_execute(decision, portfolio, prices_usd)

    # ── live (real TWAK CLI) ─────────────────────────────────────────────────
    def _twak_execute(
        self, decision: GateDecision, portfolio: Portfolio, prices_usd: dict[str, float]
    ) -> ExecutionResult:
        """Submit a real same-chain swap on BSC via the `twak` CLI.

        BUY:           swap `approved_notional_usd` of base_currency -> symbol.
        SELL/FLATTEN:  swap the full position of symbol -> base_currency.

        We quote first (--quote-only) to sanity-check, then execute. TWAK enforces
        the slippage tolerance on-chain and signs locally with the ~/.twak/ keystore.
        """
        if not self.cli.available():
            return ExecutionResult(
                ok=False, action=decision.action, symbol=decision.symbol, venue="pancakeswap",
                error="twak CLI not available — install with `npm i -g @trustwallet/cli`",
            )

        sym = decision.symbol
        base = self.s.base_currency
        if sym not in self.s.allowlist or base not in self.s.allowlist:
            return ExecutionResult(
                ok=False, action=decision.action, symbol=sym, venue="pancakeswap",
                error=f"token {sym} or base {base} missing from allowlist",
            )

        base_asset = bsc_asset_id(self.s.allowlist[base])
        sym_asset = bsc_asset_id(self.s.allowlist[sym])
        slippage_pct = self.s.rulebook["limits"]["max_slippage_bps"] / 100.0
        pw = self.s.twak_wallet_password or None

        if decision.action == Action.BUY:
            amount = decision.approved_notional_usd      # in base-currency (≈USD) units
            from_asset, to_asset = base_asset, sym_asset
        else:  # SELL / FLATTEN
            if sym not in portfolio.positions:
                return ExecutionResult(
                    ok=False, action=decision.action, symbol=sym, venue="pancakeswap",
                    error=f"no position in {sym} to sell",
                )
            amount = portfolio.positions[sym].qty        # in token units
            from_asset, to_asset = sym_asset, base_asset

        # 1. quote first (no signing) — fail fast on routing/slippage issues
        quote = self.cli.swap(amount, from_asset, to_asset, slippage_pct,
                              quote_only=True, password=None)
        if not quote.ok:
            return ExecutionResult(
                ok=False, action=decision.action, symbol=sym, venue="pancakeswap",
                error=f"quote failed: {quote.error}",
            )

        # 2. execute the real swap (signs locally)
        res = self.cli.swap(amount, from_asset, to_asset, slippage_pct,
                            quote_only=False, password=pw)
        if not res.ok:
            return ExecutionResult(
                ok=False, action=decision.action, symbol=sym, venue="pancakeswap",
                error=f"swap failed: {res.error}",
            )
        return self._parse_swap_result(decision, sym, amount, res.raw, prices_usd)

    def _parse_swap_result(
        self, decision: GateDecision, sym: str, amount: float, raw: dict,
        prices_usd: dict[str, float],
    ) -> ExecutionResult:
        """Map the CLI's JSON swap result into an ExecutionResult.

        TODO(confirm): field names below are defensive guesses — confirm against
        real `twak swap --json` output once you have keys, and tighten the mapping.
        """
        tx_hash = (
            raw.get("txHash") or raw.get("tx_hash") or raw.get("transactionHash")
            or raw.get("hash") or raw.get("id")
        )
        # amount of the token received (BUY) or base received (SELL)
        to_amount = (
            raw.get("toAmount") or raw.get("amountOut") or raw.get("toAmountMin") or 0.0
        )
        # NOTE: in live mode the portfolio is reconciled from on-chain balances
        # (twak wallet balance) by the orchestrator — we do NOT mutate it here.
        mark = prices_usd.get(sym, 0.0)
        if decision.action == Action.BUY:
            filled_qty = float(to_amount) if to_amount else 0.0
            notional = decision.approved_notional_usd
            fill_price = (notional / filled_qty) if filled_qty else mark
        else:
            filled_qty = amount
            proceeds = float(to_amount) if to_amount else filled_qty * mark
            notional = proceeds
            fill_price = (proceeds / filled_qty) if filled_qty else mark

        return ExecutionResult(
            ok=True, action=decision.action, symbol=sym,
            filled_qty=round(float(filled_qty), 10),
            fill_price_usd=round(float(fill_price), 6),
            notional_usd=round(float(notional), 2),
            fee_usd=0.0,  # real fees are on-chain; reconcile from balances
            tx_hash=str(tx_hash) if tx_hash else None,
            venue="pancakeswap",
        )

    # ── paper (simulator) ───────────────────────────────────────────────────
    def _paper_execute(
        self, decision: GateDecision, portfolio: Portfolio, prices_usd: dict[str, float]
    ) -> ExecutionResult:
        sym = decision.symbol
        mark = prices_usd.get(sym, 0.0)
        if mark <= 0:
            return ExecutionResult(
                ok=False, action=decision.action, symbol=sym,
                venue="paper", error=f"no mark price for {sym}",
            )

        if decision.action == Action.BUY:
            notional = decision.approved_notional_usd
            fill_price = mark * (1 + _PAPER_SLIP_BPS / 10_000)   # pay up a touch
            fee = notional * _PAPER_FEE_BPS / 10_000
            qty = (notional - fee) / fill_price
            state_store.apply_paper_buy(portfolio, sym, qty, fill_price, notional)
            return self._result(decision.action, sym, qty, fill_price, notional, fee)

        # SELL / FLATTEN: close the (specified or whole) position to base currency.
        if sym not in portfolio.positions:
            return ExecutionResult(
                ok=False, action=decision.action, symbol=sym,
                venue="paper", error=f"no position in {sym} to sell",
            )
        pos = portfolio.positions[sym]
        qty = pos.qty
        fill_price = mark * (1 - _PAPER_SLIP_BPS / 10_000)       # sell a touch low
        gross = qty * fill_price
        fee = gross * _PAPER_FEE_BPS / 10_000
        proceeds = gross - fee
        state_store.apply_paper_sell(portfolio, sym, qty, fill_price, proceeds)
        return self._result(decision.action, sym, qty, fill_price, proceeds, fee)

    @staticmethod
    def _result(action, sym, qty, price, notional, fee) -> ExecutionResult:
        seed = f"{action}:{sym}:{qty:.8f}:{price:.6f}:{notional:.4f}".encode()
        fake_tx = "0xpaper" + hashlib.sha256(seed).hexdigest()[:58]
        return ExecutionResult(
            ok=True, action=action, symbol=sym, filled_qty=round(qty, 10),
            fill_price_usd=round(price, 6), notional_usd=round(notional, 2),
            fee_usd=round(fee, 4), tx_hash=fake_tx, venue="paper",
        )
