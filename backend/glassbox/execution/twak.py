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
from glassbox.execution.twak_cli import TwakCLI, bsc_token_ref
from glassbox.models import Action, ExecutionResult, GateDecision, GateVerdict, Portfolio
from glassbox.storage import state as state_store


def _parse_amount(value) -> float:
    """Parse a TWAK amount field like "0.16314 WBNB" or a bare number → float."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip().split()[0])
    except (ValueError, IndexError):
        return 0.0

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

        base = self.s.base_currency
        slippage_pct = self.s.rulebook["limits"]["max_slippage_bps"] / 100.0
        # On macOS the CLI can read the password from the OS keychain, but a headless
        # host (Railway/Linux container) has no keychain — so pass the password from the
        # (env-sourced) settings. It is never logged: build_swap_args keeps it out of any
        # printed output. None falls back to keychain when the env var is unset.
        pw = self.s.twak_wallet_password or None

        def asset(s: str) -> str:
            return bsc_token_ref(self.s.allowlist[s])

        if decision.action == Action.SWAP:
            from_sym, sym = decision.from_symbol, decision.symbol
            if from_sym not in self.s.allowlist or sym not in self.s.allowlist:
                return ExecutionResult(ok=False, action=decision.action, symbol=sym,
                                       venue="pancakeswap", error=f"{from_sym}/{sym} not in allowlist")
            from_price = 1.0 if from_sym == base else prices_usd.get(from_sym, 0.0)
            if from_price <= 0:
                return ExecutionResult(ok=False, action=decision.action, symbol=sym,
                                       venue="pancakeswap", error=f"no mark for {from_sym}")
            amount = decision.approved_notional_usd / from_price  # in FROM units
            from_asset, to_asset = asset(from_sym), asset(sym)
        elif decision.action == Action.BUY:
            sym = decision.symbol
            if sym not in self.s.allowlist or base not in self.s.allowlist:
                return ExecutionResult(ok=False, action=decision.action, symbol=sym,
                                       venue="pancakeswap", error=f"{sym}/{base} not in allowlist")
            amount = decision.approved_notional_usd              # base (≈USD) units
            from_asset, to_asset = asset(base), asset(sym)
        else:  # SELL / FLATTEN
            sym = decision.symbol
            if sym not in portfolio.positions:
                return ExecutionResult(ok=False, action=decision.action, symbol=sym,
                                       venue="pancakeswap", error=f"no position in {sym} to sell")
            amount = portfolio.positions[sym].qty                # token units
            from_asset, to_asset = asset(sym), asset(base)

        # cost basis for the closed leg, so we can book realized P&L on a SELL
        cost_basis_usd = (
            amount * portfolio.positions[sym].avg_price_usd
            if decision.action == Action.SELL and sym in portfolio.positions else None
        )

        def _with_realized(r: ExecutionResult) -> ExecutionResult:
            if cost_basis_usd is not None and r.ok:
                r.realized_pnl_usd = round(r.notional_usd - cost_basis_usd, 2)
            return r

        # 1. quote first (no signing) — fail fast on routing/slippage issues
        quote = self.cli.swap(amount, from_asset, to_asset, slippage_pct,
                              quote_only=True, password=None)
        if not quote.ok:
            return ExecutionResult(
                ok=False, action=decision.action, symbol=sym, venue="pancakeswap",
                error=f"quote failed: {quote.error}",
            )
        # quote shape: {input, output, minReceived, provider, priceImpact}
        impact = _parse_amount(quote.raw.get("priceImpact"))
        if impact > slippage_pct:
            return ExecutionResult(
                ok=False, action=decision.action, symbol=sym, venue="pancakeswap",
                error=f"price impact {impact}% exceeds slippage cap {slippage_pct}%",
            )

        # DRY-RUN: report what we WOULD do, from the quote, without broadcasting.
        if self.s.dry_run:
            res = self._parse_swap_result(decision, sym, amount, quote.raw, prices_usd)
            res.venue = "pancakeswap(dry-run)"
            res.tx_hash = None
            return _with_realized(res)

        # 2. execute the real swap (signs locally) — THIS BROADCASTS ON-CHAIN
        res = self.cli.swap(amount, from_asset, to_asset, slippage_pct,
                            quote_only=False, password=pw)
        if not res.ok:
            return ExecutionResult(
                ok=False, action=decision.action, symbol=sym, venue="pancakeswap",
                error=f"swap failed: {res.error}",
            )
        return _with_realized(self._parse_swap_result(decision, sym, amount, res.raw, prices_usd))

    def _parse_swap_result(
        self, decision: GateDecision, sym: str, amount: float, raw: dict,
        prices_usd: dict[str, float],
    ) -> ExecutionResult:
        """Map the CLI's JSON swap result into an ExecutionResult.

        Confirmed quote/execute shape (twak v0.19.1):
            {"input":"100 USDT","output":"0.16314 WBNB","minReceived":"0.1618 WBNB",
             "provider":"LiquidMesh","priceImpact":"0"}
        Execute adds a tx hash field. We parse defensively across likely names.

        NOTE: in live mode the portfolio is reconciled from on-chain balances
        (twak wallet portfolio) by the orchestrator — we do NOT mutate it here.
        """
        tx_hash = (
            raw.get("txHash") or raw.get("transactionHash") or raw.get("hash")
            or raw.get("tx") or raw.get("id")
        )
        # "output" is what the wallet receives: token (BUY) or base currency (SELL)
        out_qty = _parse_amount(raw.get("output"))
        mark = prices_usd.get(sym, 0.0)

        if decision.action == Action.BUY:
            filled_qty = out_qty                          # token received
            notional = decision.approved_notional_usd
            fill_price = (notional / filled_qty) if filled_qty else mark
        else:
            filled_qty = amount                           # token sold
            proceeds = out_qty if out_qty else filled_qty * mark   # base received
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
        # SWAP — generic any→any (manual)
        if decision.action == Action.SWAP:
            from_sym, to_sym = decision.from_symbol, decision.symbol
            usd = decision.approved_notional_usd
            to_qty, to_price, realized = state_store.apply_paper_swap(
                portfolio, from_sym, to_sym, usd, prices_usd,
                self.s.base_currency, _PAPER_FEE_BPS, _PAPER_SLIP_BPS,
            )
            fee = usd * _PAPER_FEE_BPS / 10_000
            return self._result(Action.SWAP, to_sym, to_qty, to_price, usd, fee, realized)

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
        realized = state_store.apply_paper_sell(portfolio, sym, qty, fill_price, proceeds)
        return self._result(decision.action, sym, qty, fill_price, proceeds, fee, realized)

    @staticmethod
    def _result(action, sym, qty, price, notional, fee, realized=0.0) -> ExecutionResult:
        seed = f"{action}:{sym}:{qty:.8f}:{price:.6f}:{notional:.4f}".encode()
        fake_tx = "0xpaper" + hashlib.sha256(seed).hexdigest()[:58]
        return ExecutionResult(
            ok=True, action=action, symbol=sym, filled_qty=round(qty, 10),
            fill_price_usd=round(price, 6), notional_usd=round(notional, 2),
            fee_usd=round(fee, 4), realized_pnl_usd=round(realized, 2),
            tx_hash=fake_tx, venue="paper",
        )
