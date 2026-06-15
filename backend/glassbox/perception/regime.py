"""Pure regime classifier — shared by every perception source.

Maps real market metrics (Fear & Greed + BTC 24h change) to a trading regime.
Deterministic and unit-testable; no I/O.
"""

from __future__ import annotations

from glassbox.models import Regime


def classify_regime(fear_greed: int | None, btc_24h_change_pct: float | None) -> Regime:
    """Map live market metrics → trading regime. risk_off is reserved for genuine
    capitulation (extreme fear AND/OR a sharp BTC drop); ordinary fear is still a
    tradeable NEUTRAL regime where the agent deploys small, disciplined probes
    (the take-profit / stop-loss / drawdown breaker do the risk work, not inaction)."""
    fg = fear_greed if fear_greed is not None else 50
    chg = btc_24h_change_pct if btc_24h_change_pct is not None else 0.0
    if fg <= 12 or chg <= -8.0:
        return Regime.RISK_OFF                 # true capitulation → stand down
    if fg >= 78 and chg >= 6.0:
        return Regime.EUPHORIA                 # froth → trim/fade
    if fg >= 52 and chg >= 0.0:
        return Regime.RISK_ON                  # constructive → deploy on conviction
    return Regime.NEUTRAL                       # everything else → trade small
