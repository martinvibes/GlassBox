"""Pure regime classifier — shared by every perception source.

Maps real market metrics (Fear & Greed + BTC 24h change) to a trading regime.
Deterministic and unit-testable; no I/O.
"""

from __future__ import annotations

from glassbox.models import Regime


def classify_regime(fear_greed: int | None, btc_24h_change_pct: float | None) -> Regime:
    """Conservative classifier — when data is missing, assume neutral (the gate's
    own default posture is risk_off, so missing signals never lead to risk-taking)."""
    fg = fear_greed if fear_greed is not None else 50
    chg = btc_24h_change_pct if btc_24h_change_pct is not None else 0.0
    if fg <= 25 or chg <= -6.0:
        return Regime.RISK_OFF
    if fg >= 80 and chg >= 8.0:
        return Regime.EUPHORIA
    if fg >= 60 and chg >= 2.0:
        return Regime.RISK_ON
    return Regime.NEUTRAL
