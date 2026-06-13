"""Perception entry point — CMC Agent Hub, layered over real market data.

Resolution order (perception is ALWAYS real — never synthetic):
  1. CMC Agent Hub MCP (decision-ready signals) — when CMC_MCP_API_KEY is set.
  2. Live public market data (CoinGecko + alternative.me) — keyless baseline.
  3. On total failure → a SAFE risk-off / UNKNOWN view with no positions-inducing
     data. The gate then defaults to risk_off and trades nothing. No mock prices, ever.

The CMC MCP path (https://mcp.coinmarketcap.com/mcp, header X-CMC-MCP-API-KEY,
tools get_crypto_quotes_latest / get_global_metrics_latest, plus the x402
pay-per-call route) is what earns the "Best CMC" special — wire it in week 1 when
you have a key. Until then the baseline is genuine live data.
"""

from __future__ import annotations

from datetime import datetime, timezone

import httpx

from glassbox.config import Settings
from glassbox.models import Regime, Signals
from glassbox.perception.market import LiveMarketData
from glassbox.perception.regime import classify_regime  # noqa: F401 (re-export)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CMCPerception:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        self.market = LiveMarketData(settings)

    def fetch(self) -> Signals:
        # 1. CMC Agent Hub, if a key is configured
        if self.s.cmc_mcp_api_key:
            try:
                return self._cmc_signals()
            except Exception as exc:
                sig = self._baseline()
                sig.notes.append(f"CMC MCP unavailable, using public market data: {exc}")
                return sig
        # 2. keyless live baseline
        return self._baseline()

    def _baseline(self) -> Signals:
        try:
            return self.market.fetch()
        except Exception as exc:
            # 3. safe degraded view — risk-off, no prices → gate trades nothing
            return Signals(
                regime=Regime.UNKNOWN,
                notes=[f"live market fetch failed → safe risk-off (no trading): {exc}"],
                source="none",
                ts=_now_iso(),
            )

    # ── CMC Agent Hub MCP (TODO wire — needs an API key to test) ─────────────
    def _cmc_signals(self) -> Signals:
        """TODO(wire): call the CMC Agent Hub MCP endpoint and merge its
        decision-ready signals on top of the live baseline.

        POST {CMC_MCP_ENDPOINT}
          headers: {"X-CMC-MCP-API-KEY": key, "Content-Type": "application/json"}
          body: {"jsonrpc":"2.0","id":1,"method":"tools/call",
                 "params":{"name":"get_global_metrics_latest","arguments":{}}}
        Then per-token get_crypto_quotes_latest. If CMC_X402_ENABLED, route through
        the x402 pay-per-call flow instead (this is what earns the Best CMC special).

        Strategy: start from self.market.fetch() (real prices) and OVERWRITE/extend
        with CMC's richer regime + per-token analytics. Never fall back to fake data.
        """
        with httpx.Client(timeout=15) as client:
            _ = client  # noqa: F841  (wire the JSON-RPC call here)
            raise NotImplementedError(
                "CMC MCP transport not wired yet — see TODO(wire) in _cmc_signals"
            )
