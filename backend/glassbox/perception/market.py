"""Live market data — REAL, keyless public sources. No mock data.

This is the baseline perception layer. It always returns genuine, current market
data so the agent never reasons over fabricated numbers:

  * Prices + 24h momentum + 24h volume  →  CoinGecko public API (keyless)
  * Fear & Greed index                  →  alternative.me public API (keyless)

The CMC Agent Hub (see cmc.py) layers richer, decision-ready signals on top of
this when an API key is configured — but even with no keys at all, perception is
100% real. Per-trade slippage is intentionally NOT estimated here; it is quoted
for real at execution time by TWAK against the live DEX.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from glassbox.config import Settings
from glassbox.models import Regime, Signals
from glassbox.perception.regime import classify_regime

# Last successful market read. Public APIs (CoinGecko especially) throttle hard, so
# a single 429 must NOT blind the agent — we reuse the last-good signals (slightly
# stale prices) rather than collapsing to an empty risk-off view that halts trading.
_LAST_GOOD: Signals | None = None

STABLES = {"USDT", "USDC"}

COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets"
FNG_URL = "https://api.alternative.me/fng/?limit=1"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class LiveMarketData:
    def __init__(self, settings: Settings) -> None:
        self.s = settings

    def fetch(self) -> Signals:
        """Return Signals built from live public data. On a transient upstream
        failure (e.g. CoinGecko 429) reuse the last-good read so the agent keeps
        trading on slightly-stale data; only raise if we've never had a good read."""
        global _LAST_GOOD
        # The tradeable universe IS the allowlist: fetch every non-stable token that
        # carries a CoinGecko id. Add a token to token_allowlist.json and it trades.
        ids = {
            sym: tok.coingecko_id
            for sym, tok in self.s.allowlist.items()
            if tok.coingecko_id and not tok.is_stable
        }
        fear_greed = self._fetch_fear_greed()
        prices, tokens, btc_change = self._fetch_coingecko(ids)

        # a good read needs at least one volatile token priced; otherwise reuse last-good
        # (in-memory, or persisted from a previous run so a cold start is never blind)
        if not tokens:
            cached = _LAST_GOOD or self._load_cached()
            if cached is not None:
                stale = cached.model_copy(deep=True)
                stale.ts = _now_iso()
                stale.notes = ["live source throttled → reusing last-good market data (stale prices)"]
                return stale
            raise RuntimeError("no market data and no last-good cache")

        # stablecoins are marked at 1.0 (the base currency must be present)
        for sym in self.s.allowlist:
            if self.s.allowlist[sym].is_stable:
                prices[sym] = 1.0

        regime = classify_regime(fear_greed, btc_change)
        sig = Signals(
            regime=regime,
            fear_greed=fear_greed,
            btc_price=prices.get("BTCB"),
            bnb_price=prices.get("WBNB"),
            tokens=tokens,
            prices_usd=prices,
            notes=[f"live market data: CoinGecko + alternative.me (F&G={fear_greed})"],
            source="coingecko+fng",
            ts=_now_iso(),
        )
        _LAST_GOOD = sig
        self._save_cached(sig)
        return sig

    def _cache_path(self) -> Path:
        return Path(self.s.data_dir) / "last_market.json"

    def _load_cached(self) -> Signals | None:
        try:
            return Signals.model_validate_json(self._cache_path().read_text())
        except Exception:
            return None

    def _save_cached(self, sig: Signals) -> None:
        try:
            self._cache_path().write_text(sig.model_dump_json())
        except Exception:
            pass

    # ── sources ─────────────────────────────────────────────────────────────
    def _fetch_coingecko(
        self, ids: dict[str, str]
    ) -> tuple[dict[str, float], dict[str, dict], float | None]:
        if not ids:
            return {}, {}, None
        # /coins/markets gives MULTI-TIMEFRAME momentum (1h/24h/7d) in one call, so the
        # agent can tell a trend (1h+24h+7d aligned) from an oversold reclaim (24h red,
        # 1h turning green) — the difference between momentum and mean-reversion entries.
        params = {
            "vs_currency": "usd",
            "ids": ",".join(sorted(set(ids.values()))),
            "price_change_percentage": "1h,24h,7d",
            "per_page": "100",
            "page": "1",
        }
        rows: list = []
        with httpx.Client(timeout=15) as client:
            for attempt in range(3):
                try:
                    resp = client.get(COINGECKO_URL, params=params)
                    resp.raise_for_status()
                    rows = resp.json()
                    break
                except Exception:
                    if attempt == 2:
                        return {}, {}, None
                    time.sleep(1.5 * (attempt + 1))

        by_id = {r.get("id"): r for r in rows if isinstance(r, dict)}
        prices: dict[str, float] = {}
        tokens: dict[str, dict] = {}
        btc_change: float | None = None
        for sym, cg in ids.items():
            row = by_id.get(cg)
            if not row or row.get("current_price") is None:
                continue
            price = float(row["current_price"])
            m1 = float(row.get("price_change_percentage_1h_in_currency") or 0.0)
            m24 = float(row.get("price_change_percentage_24h_in_currency") or 0.0)
            m7 = float(row.get("price_change_percentage_7d_in_currency") or 0.0)
            prices[sym] = price
            tokens[sym] = {
                "momentum_1h": m1 / 100.0,             # real 1h % change → fraction
                "momentum_24h": m24 / 100.0,           # real 24h % change → fraction
                "momentum_7d": m7 / 100.0,             # real 7d % change → fraction
                "liquidity_usd": float(row.get("total_volume") or 0.0),
                "market_cap_usd": float(row.get("market_cap") or 0.0),
                "price_usd": price,
            }
            if cg == "bitcoin":
                btc_change = m24
        return prices, tokens, btc_change

    def _fetch_fear_greed(self) -> int | None:
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(FNG_URL)
                resp.raise_for_status()
                return int(resp.json()["data"][0]["value"])
        except Exception:
            return None  # missing F&G → classifier treats as neutral; gate stays cautious
