import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Live USD marks for the volatile allowlist tokens, used to mark open positions
// in real time (the decision log only refreshes on the agent's slow heartbeat).
// CoinGecko primary (reliable, tracks the chart); Binance fallback (matches the
// TradingView feed exactly where it's reachable). Stablecoins are pegged at $1.
const CG_IDS: Record<string, string> = {
  WBNB: "binancecoin", BTCB: "bitcoin", ETH: "ethereum", SOL: "solana", CAKE: "pancakeswap-token",
};
const BINANCE: Record<string, string> = {
  WBNB: "BNBUSDT", BTCB: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", CAKE: "CAKEUSDT",
};

// cross-request cache (survives route-module re-evaluation) so two pollers can't
// hammer the upstream rate limit.
const g = globalThis as unknown as { __pxCache?: { prices: Record<string, number>; ts: number } };
g.__pxCache ??= { prices: {}, ts: 0 };
const TTL = 12000;

async function fromCoinGecko(): Promise<Record<string, number> | null> {
  try {
    const ids = [...new Set(Object.values(CG_IDS))].join(",");
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    const out: Record<string, number> = {};
    for (const [sym, id] of Object.entries(CG_IDS)) {
      const v = j?.[id]?.usd;
      if (typeof v === "number" && v > 0) out[sym] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

async function fromBinance(): Promise<Record<string, number> | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  try {
    const syms = JSON.stringify(Object.values(BINANCE));
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(syms)}`,
      { cache: "no-store", signal: ctrl.signal });
    if (!r.ok) return null;
    const arr = (await r.json()) as { symbol: string; price: string }[];
    const out: Record<string, number> = {};
    for (const [sym, b] of Object.entries(BINANCE)) {
      const v = arr.find((x) => x.symbol === b);
      if (v && parseFloat(v.price) > 0) out[sym] = parseFloat(v.price);
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const now = Date.now();
  const c = g.__pxCache!;
  if (now - c.ts < TTL && Object.keys(c.prices).length) {
    return NextResponse.json({ prices: { USDT: 1, USDC: 1, ...c.prices }, cached: true });
  }
  const fresh = (await fromCoinGecko()) ?? (await fromBinance());
  if (fresh) {
    c.prices = fresh;
    c.ts = now;
  }
  return NextResponse.json({ prices: { USDT: 1, USDC: 1, ...c.prices }, cached: false });
}
