"""Core data models. Everything that flows through the pipeline is a typed,
serializable artifact — this is what makes every decision auditable.

Pipeline:  Signals → TradeProposal → GateDecision → ExecutionResult → DecisionRecord
"""

from __future__ import annotations

import hashlib
import json
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── enums ────────────────────────────────────────────────────────────────
class Regime(str, Enum):
    RISK_OFF = "risk_off"
    NEUTRAL = "neutral"
    RISK_ON = "risk_on"
    EUPHORIA = "euphoria"
    UNKNOWN = "unknown"


class Action(str, Enum):
    BUY = "buy"     # base_currency -> token
    SELL = "sell"   # token -> base_currency
    HOLD = "hold"   # do nothing this cycle
    SWAP = "swap"   # any token -> any token (user-directed, manual mode)


class GateVerdict(str, Enum):
    ALLOW = "allow"          # execute as-is
    CLAMP = "clamp"          # execute, but with reduced size
    BLOCK = "block"          # do not execute
    FLATTEN = "flatten"      # emergency: close everything (drawdown breach)


# ── perception ───────────────────────────────────────────────────────────
class Signals(BaseModel):
    """Decision-ready market view, normalized from CMC Agent Hub."""

    regime: Regime = Regime.UNKNOWN
    fear_greed: Optional[int] = None              # 0..100
    btc_price: Optional[float] = None
    bnb_price: Optional[float] = None
    # symbol -> rich per-token signal blob (momentum, liquidity, funding, etc.)
    tokens: dict[str, dict[str, Any]] = Field(default_factory=dict)
    prices_usd: dict[str, float] = Field(default_factory=dict)   # symbol -> mark price
    notes: list[str] = Field(default_factory=list)
    source: str = "unknown"                       # mcp | x402 | rest | paper
    ts: Optional[str] = None                       # ISO timestamp, set by caller


# ── portfolio ────────────────────────────────────────────────────────────
class Position(BaseModel):
    symbol: str
    qty: float
    avg_price_usd: float

    def value_usd(self, mark: float) -> float:
        return self.qty * mark


class Portfolio(BaseModel):
    base_currency: str = "USDT"
    cash_usd: float = 0.0                          # base-currency balance, in USD
    positions: dict[str, Position] = Field(default_factory=dict)
    high_water_mark_usd: float = 0.0               # peak equity ever seen
    realized_pnl_usd: float = 0.0                  # cumulative booked P&L over the session

    def equity_usd(self, prices_usd: dict[str, float]) -> float:
        eq = self.cash_usd
        for sym, pos in self.positions.items():
            eq += pos.value_usd(prices_usd.get(sym, pos.avg_price_usd))
        return eq

    def gross_exposure_usd(self, prices_usd: dict[str, float]) -> float:
        return sum(
            pos.value_usd(prices_usd.get(sym, pos.avg_price_usd))
            for sym, pos in self.positions.items()
        )

    def drawdown_pct(self, prices_usd: dict[str, float]) -> float:
        """Current drawdown from the high-water mark, as a positive percent."""
        eq = self.equity_usd(prices_usd)
        hwm = max(self.high_water_mark_usd, eq)
        if hwm <= 0:
            return 0.0
        return max(0.0, (hwm - eq) / hwm * 100.0)


# ── reasoning ────────────────────────────────────────────────────────────
class TradeProposal(BaseModel):
    """What the LLM (or heuristic) PROPOSES. Never executed without the gate."""

    action: Action
    symbol: str = ""                               # token symbol (SWAP: the FROM token)
    to_symbol: str = ""                             # SWAP only: the TO token
    size_pct: float = 0.0                           # requested % of equity for this trade
    conviction: float = 0.0                         # 0..1 confidence
    rationale: str = ""                             # human-readable reasoning (audited)
    proposed_regime: Regime = Regime.UNKNOWN
    source: str = "heuristic"                       # llm | heuristic | dca | manual | operator
    directed: bool = False                           # user-directed (DCA/manual): skip AI gates, keep hard safety


# ── risk gate ────────────────────────────────────────────────────────────
class GateDecision(BaseModel):
    """What the deterministic gate DISPOSES. The source of truth for execution."""

    verdict: GateVerdict
    action: Action
    symbol: str = ""                               # SWAP: the TO token
    from_symbol: str = ""                           # SWAP only: the FROM token
    approved_size_pct: float = 0.0                  # final size after clamping (% equity)
    approved_notional_usd: float = 0.0              # final notional in USD
    reasons: list[str] = Field(default_factory=list)  # why the gate decided this
    drawdown_pct: float = 0.0
    posture: str = ""


# ── execution ────────────────────────────────────────────────────────────
class ExecutionResult(BaseModel):
    ok: bool
    action: Action
    symbol: str = ""
    filled_qty: float = 0.0
    fill_price_usd: float = 0.0
    notional_usd: float = 0.0
    fee_usd: float = 0.0
    realized_pnl_usd: float = 0.0                   # P&L booked on a CLOSE (sell/convert-out): +profit / −loss
    tx_hash: Optional[str] = None
    venue: str = "paper"                            # paper | pancakeswap | bsc_perp
    error: Optional[str] = None


# ── the audit artifact (OpenAlice-style: one record per decision) ─────────
class DecisionRecord(BaseModel):
    """The complete, hashable story of one heartbeat cycle. Appended to JSONL,
    and its hash is anchored on-chain. This IS the transparency layer."""

    cycle_id: int
    ts: str
    signals: Signals
    proposal: TradeProposal
    decision: GateDecision
    execution: Optional[ExecutionResult] = None
    equity_usd: float = 0.0
    drawdown_pct: float = 0.0
    prev_hash: Optional[str] = None                # chains records together
    anchor_tx: Optional[str] = None                # on-chain proof (set post-anchor)

    def canonical_hash(self) -> str:
        """Deterministic SHA-256 over the decision content (excludes anchor_tx,
        which is filled in *after* hashing). This hash is what we anchor."""
        payload = self.model_dump(mode="json", exclude={"anchor_tx"})
        blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()
