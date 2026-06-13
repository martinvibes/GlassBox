import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Real OHLC candles from CoinGecko (keyless). Proxied server-side to avoid CORS.
const IDS: Record<string, string> = {
  BNB: "binancecoin",
  BTC: "bitcoin",
  ETH: "ethereum",
  CAKE: "pancakeswap-token",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sym = (searchParams.get("symbol") ?? "BNB").toUpperCase();
  const days = searchParams.get("days") ?? "1";
  const id = IDS[sym] ?? "binancecoin";

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`coingecko ${r.status}`);
    const raw: number[][] = await r.json();
    // [ms, o, h, l, c] → lightweight-charts candle {time(sec), open, high, low, close}
    const candles = raw.map(([ms, o, h, l, c]) => ({
      time: Math.floor(ms / 1000),
      open: o,
      high: h,
      low: l,
      close: c,
    }));
    return NextResponse.json({ ok: true, symbol: sym, candles });
  } catch (e) {
    return NextResponse.json(
      { ok: false, symbol: sym, candles: [], error: String(e) },
      { status: 200 },
    );
  }
}
