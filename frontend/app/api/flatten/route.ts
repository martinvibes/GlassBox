import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readEnv, readPortfolio, readDecisions, writeCommand } from "@/lib/backend";
import { denyIfUnauthorized } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DATA = path.join(process.cwd(), "..", "backend", "data");
const STABLE = (s: string) => s === "USDT" || s === "USDC";
const CG: Record<string, string> = {
  WBNB: "binancecoin", BTCB: "bitcoin", ETH: "ethereum", SOL: "solana", CAKE: "pancakeswap-token",
  XRP: "ripple", ADA: "cardano", DOGE: "dogecoin", DOT: "polkadot", LINK: "chainlink",
  LTC: "litecoin", MATIC: "matic-network", AVAX: "avalanche-2", UNI: "uniswap", ATOM: "cosmos",
};

async function marks(syms: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(syms.map((s) => CG[s]).filter(Boolean))].join(",");
  if (!ids) return {};
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { cache: "no-store" });
    const j = await r.json();
    const out: Record<string, number> = {};
    for (const s of syms) { const c = CG[s]; if (c && j[c]?.usd) out[s] = j[c].usd; }
    return out;
  } catch { return {}; }
}

// Close ALL open positions to cash. Works WITHOUT the agent running (paper mode is
// flattened directly here; live mode queues a flatten command for the agent's signer).
export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;
  const env = await readEnv();
  const mode = env.GLASSBOX_MODE ?? "paper";
  const pf = await readPortfolio();
  if (!pf) return NextResponse.json({ ok: false, error: "no portfolio" }, { status: 500 });

  const positions: Record<string, { symbol: string; qty: number; avg_price_usd: number; peak_price_usd?: number }> =
    (pf as unknown as { positions: Record<string, { symbol: string; qty: number; avg_price_usd: number }> }).positions ?? {};
  const vol = Object.entries(positions).filter(([s]) => !STABLE(s));
  const looseStables = Object.entries(positions).filter(([s]) => STABLE(s) && s !== pf.base_currency);
  if (vol.length === 0 && looseStables.length === 0) {
    return NextResponse.json({ ok: true, closed: [], message: "already flat" });
  }

  // LIVE needs real on-chain swaps → must go through the agent's signer.
  if (mode === "live") {
    await writeCommand({ action: "flatten", symbol: "", from: "", to: "", size_pct: 0, amount_usd: 0, ts: `${Date.now()}` } as never);
    return NextResponse.json({ ok: true, queued: true, message: "live flatten queued — start the agent to execute it on-chain" });
  }

  // PAPER → flatten directly, mark to live price, book realized P&L, log each close.
  const px = await marks(vol.map(([s]) => s));
  const decisions = await readDecisions();
  let cid = decisions.length ? decisions[decisions.length - 1].cycle_id : -1;
  const ts = new Date().toISOString();

  let equity = pf.cash_usd + vol.reduce((a, [s, p]) => a + p.qty * (px[s] ?? p.avg_price_usd), 0)
    + looseStables.reduce((a, [, p]) => a + p.qty, 0);

  const closed: { symbol: string; proceeds: number; realized: number }[] = [];
  let realizedTotal = 0;
  const lines: string[] = [];
  for (const [sym, p] of vol) {
    const mark = px[sym] ?? p.avg_price_usd;
    const fee = p.qty * mark * 0.0033;
    const proceeds = p.qty * mark - fee;
    const realized = proceeds - p.qty * p.avg_price_usd;
    pf.cash_usd += proceeds;
    (pf as { realized_pnl_usd?: number }).realized_pnl_usd = ((pf as { realized_pnl_usd?: number }).realized_pnl_usd ?? 0) + realized;
    realizedTotal += realized;
    equity -= fee;
    cid += 1;
    closed.push({ symbol: sym, proceeds: round(proceeds), realized: round(realized) });
    lines.push(JSON.stringify(record(cid, ts, sym, p.qty, mark, proceeds, fee, realized, equity)));
  }
  for (const [, p] of looseStables) pf.cash_usd += p.qty;
  (pf as { positions: Record<string, unknown> }).positions = {};

  if (lines.length) await fs.appendFile(path.join(DATA, "decisions.jsonl"), lines.map((l) => l + "\n").join(""), "utf8");
  await fs.writeFile(path.join(DATA, "portfolio.json"), JSON.stringify(pf, null, 2), "utf8");

  return NextResponse.json({ ok: true, closed, realizedTotal: round(realizedTotal), cash: round(pf.cash_usd) });
}

const round = (n: number) => Math.round(n * 100) / 100;

function record(cid: number, ts: string, sym: string, qty: number, mark: number, proceeds: number, fee: number, realized: number, equity: number) {
  return {
    cycle_id: cid, ts,
    signals: { regime: "unknown", fear_greed: null, btc_price: null, bnb_price: null, prices_usd: {}, tokens: {}, notes: ["operator flatten"], source: "operator", ts },
    proposal: { action: "sell", symbol: sym, to_symbol: "", size_pct: 100, conviction: 1, rationale: "operator: close all positions to cash", proposed_regime: "unknown", source: "operator:flatten", directed: true },
    decision: { verdict: "allow", action: "sell", symbol: sym, from_symbol: "", approved_size_pct: 100, approved_notional_usd: round(proceeds), reasons: ["operator flatten → closed to cash"], drawdown_pct: 0, posture: "" },
    execution: { ok: true, action: "sell", symbol: sym, filled_qty: qty, fill_price_usd: Math.round(mark * 1e6) / 1e6, notional_usd: round(proceeds), fee_usd: Math.round(fee * 1e4) / 1e4, realized_pnl_usd: round(realized), tx_hash: "0xpaperflatten" + cid, venue: "paper", error: null },
    equity_usd: round(equity), drawdown_pct: 0, prev_hash: null, anchor_tx: null,
  };
}
