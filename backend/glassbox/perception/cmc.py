"""Perception layer — CMC Agent Hub.

Pulls decision-ready signals and normalizes them into a `Signals` object the rest
of the pipeline consumes. Three transports:

  * mcp    — CMC Agent Hub MCP endpoint (https://mcp.coinmarketcap.com/mcp,
             header X-CMC-MCP-API-KEY). Tools: get_crypto_quotes_latest,
             get_global_metrics_latest, etc.  ← TODO(wire)
  * x402   — keyless pay-per-call path (sweeps the "Best CMC" special). ← TODO(wire)
  * paper  — fully offline synthetic signals so the loop runs with no keys.

The live transports are stubbed with the correct shape; fill the TODO(wire)
blocks in week 1 against the real CMC docs.
"""

from __future__ import annotations

from datetime import datetime, timezone

import httpx

from glassbox.config import Settings
from glassbox.models import Regime, Signals

# Symbols we care about beyond the base currency (intersect with allowlist).
_WATCH = ["BNB", "BTC", "ETH", "CAKE"]
# Map watch symbols to allowlist symbols (BNB↔WBNB, BTC↔BTCB on BSC).
_ALLOWLIST_ALIAS = {"BNB": "WBNB", "BTC": "BTCB"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CMCPerception:
    def __init__(self, settings: Settings) -> None:
        self.s = settings

    def fetch(self) -> Signals:
        """Return normalized Signals. Falls back to paper on any failure so the
        loop never dies on a perception error."""
        if not self.s.is_live or not self.s.cmc_mcp_api_key:
            return self._paper_signals()
        try:
            return self._live_signals()
        except Exception as exc:  # perception must never crash the loop
            sig = self._paper_signals()
            sig.notes.append(f"live CMC fetch failed, using paper signals: {exc}")
            sig.source = "paper(fallback)"
            return sig

    # ── live ──────────────────────────────────────────────────────────────
    def _live_signals(self) -> Signals:
        """TODO(wire): call the CMC Agent Hub MCP endpoint.

        Shape to implement (MCP JSON-RPC over HTTP):
            POST {endpoint}
            headers: {"X-CMC-MCP-API-KEY": key, "Content-Type": "application/json"}
            body: {"jsonrpc":"2.0","id":1,"method":"tools/call",
                   "params":{"name":"get_global_metrics_latest","arguments":{}}}
        Then normalize fear_greed / dominance / regime, and per-token
        get_crypto_quotes_latest into Signals.tokens + prices_usd.

        If CMC_X402_ENABLED, route through the x402 pay-per-call flow instead
        (this is what earns the "Best CMC" special — keep it on the live path).
        """
        # Placeholder live call so the structure is real; replace internals.
        with httpx.Client(timeout=15) as client:
            _ = client  # noqa: F841  (wire the JSON-RPC call here)
            raise NotImplementedError(
                "CMC MCP transport not wired yet — see TODO(wire) in _live_signals"
            )

    @staticmethod
    def regime_from_metrics(fear_greed: int, btc_24h_change: float) -> Regime:
        """Pure helper: classify regime from global metrics. Unit-testable."""
        if fear_greed <= 25 or btc_24h_change <= -6:
            return Regime.RISK_OFF
        if fear_greed >= 80 and btc_24h_change >= 8:
            return Regime.EUPHORIA
        if fear_greed >= 60 and btc_24h_change >= 2:
            return Regime.RISK_ON
        return Regime.NEUTRAL

    # ── paper ─────────────────────────────────────────────────────────────
    def _paper_signals(self) -> Signals:
        """Deterministic-ish synthetic signals for offline development.

        Defaults to a NEUTRAL regime with a single modest-conviction BNB setup,
        so the full pipeline exercises perceive→reason→gate→execute without keys.
        Override via data/paper_signals.json if you want to script scenarios.
        """
        prices = {"WBNB": 600.0, "BTCB": 65000.0, "ETH": 3200.0, "CAKE": 2.4, self.s.base_currency: 1.0}
        tokens = {
            "WBNB": {"momentum_24h": 0.031, "est_slippage_bps": 22, "liquidity_usd": 9_000_000},
            "BTCB": {"momentum_24h": 0.012, "est_slippage_bps": 10, "liquidity_usd": 40_000_000},
            "ETH": {"momentum_24h": 0.018, "est_slippage_bps": 15, "liquidity_usd": 20_000_000},
            "CAKE": {"momentum_24h": -0.02, "est_slippage_bps": 60, "liquidity_usd": 1_500_000},
        }
        return Signals(
            regime=Regime.NEUTRAL,
            fear_greed=58,
            btc_price=prices["BTCB"],
            bnb_price=prices["WBNB"],
            tokens=tokens,
            prices_usd=prices,
            notes=["synthetic paper signals (no live CMC keys configured)"],
            source="paper",
            ts=_now_iso(),
        )
