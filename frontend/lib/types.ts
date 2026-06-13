// Mirrors backend/glassbox/models.py — the audit artifacts the dashboard renders.

export type Regime = "risk_off" | "neutral" | "risk_on" | "euphoria" | "unknown";
export type Action = "buy" | "sell" | "hold";
export type Verdict = "allow" | "clamp" | "block" | "flatten";

export interface Signals {
  regime: Regime;
  fear_greed: number | null;
  btc_price: number | null;
  bnb_price: number | null;
  prices_usd: Record<string, number>;
  tokens: Record<string, Record<string, number>>;
  notes: string[];
  source: string;
  ts: string | null;
}

export interface Proposal {
  action: Action;
  symbol: string;
  size_pct: number;
  conviction: number;
  rationale: string;
  source: string;
}

export interface Decision {
  verdict: Verdict;
  action: Action;
  symbol: string;
  approved_size_pct: number;
  approved_notional_usd: number;
  reasons: string[];
  drawdown_pct: number;
  posture: string;
}

export interface Execution {
  ok: boolean;
  action: Action;
  symbol: string;
  filled_qty: number;
  fill_price_usd: number;
  notional_usd: number;
  fee_usd: number;
  tx_hash: string | null;
  venue: string;
  error: string | null;
}

export interface DecisionRecord {
  cycle_id: number;
  ts: string;
  signals: Signals;
  proposal: Proposal;
  decision: Decision;
  execution: Execution | null;
  equity_usd: number;
  drawdown_pct: number;
  prev_hash: string | null;
  anchor_tx: string | null;
}

export interface Position {
  symbol: string;
  qty: number;
  avg_price_usd: number;
}

export interface Portfolio {
  base_currency: string;
  cash_usd: number;
  positions: Record<string, Position>;
  high_water_mark_usd: number;
}

export interface StatePayload {
  ok: boolean;
  mode: string;
  wallet: string | null;
  agentId: string | null;
  portfolio: Portfolio | null;
  latest: DecisionRecord | null;
  cycles: number;
  equity: number;
  startEquity: number;
  drawdownPct: number;
  internalCeilingPct: number;
  competitionCapPct: number;
  regime: Regime;
  fearGreed: number | null;
  equitySeries: { t: number; v: number }[];
}
