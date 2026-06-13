"""Execution layer — Trust Wallet Agent Kit (TWAK).

TWAK is the MANDATORY execution path for Track 1: local self-custody signing,
autonomous operation mode, on-chain execution on BSC (PancakeSwap spot first;
perps later, carefully). Setup:

    npm i -g @trustwallet/cli         # provides `twak`
    npx skills add trustwallet/tw-agent-skills
    # Access ID + HMAC secret from portal.trustwallet.com → ~/.twak/
    twak serve                        # exposes the agent tools over MCP

Two backends:
  * twak  — real swaps via the TWAK MCP endpoint. ← TODO(wire)
  * paper — deterministic fill simulator with realistic fees + slippage, so the
            full loop runs end-to-end with no wallet and no funds.

SECURITY: keys live in the TWAK keystore (~/.twak/), never here and never in logs.
"""

from __future__ import annotations

import hashlib

import httpx

from glassbox.config import Settings
from glassbox.models import Action, ExecutionResult, GateDecision, GateVerdict, Portfolio
from glassbox.storage import state as state_store

# Paper-trading cost model (tune to BSC reality).
_PAPER_FEE_BPS = 25      # ~0.25% round-trip-ish per leg (PancakeSwap + gas proxy)
_PAPER_SLIP_BPS = 8      # baseline adverse slippage applied to the mark


class Executor:
    def __init__(self, settings: Settings) -> None:
        self.s = settings

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

    # ── live (TWAK) ─────────────────────────────────────────────────────────
    def _twak_execute(
        self, decision: GateDecision, portfolio: Portfolio, prices_usd: dict[str, float]
    ) -> ExecutionResult:
        """TODO(wire): submit the swap through the TWAK MCP endpoint.

        Flow (agent-wallet / autonomous mode — no per-tx approval):
          1. Resolve token addresses from settings.allowlist.
          2. For BUY:  swap base_currency -> symbol for approved_notional_usd.
             For SELL/FLATTEN: swap symbol -> base_currency (full position).
          3. POST a `swap` / `sign_and_send` tool call to TWAK_MCP_ENDPOINT,
             enforcing max_slippage_bps from the rulebook on-chain.
          4. Return the real tx_hash, filled qty, and fill price.

        TWAK signs LOCALLY with the keystore in ~/.twak/. We never see the key.
        """
        with httpx.Client(timeout=30) as client:
            _ = client  # noqa: F841  (wire the MCP tool call here)
            raise NotImplementedError(
                "TWAK transport not wired yet — see TODO(wire) in _twak_execute"
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
