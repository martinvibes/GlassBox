import { NextResponse } from "next/server";
import { readEnv, readAllowlistTokens } from "@/lib/backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RPC = "https://bsc-dataseed.binance.org/";
const CG_IDS: Record<string, string> = {
  WBNB: "binancecoin",
  BTCB: "bitcoin",
  ETH: "ethereum",
  CAKE: "pancakeswap-token",
  SOL: "solana",
};

async function rpc(method: string, params: unknown[]): Promise<string> {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  const j = await r.json();
  return j.result ?? "0x0";
}

function hexToNum(hex: string, decimals: number): number {
  if (!hex || hex === "0x") return 0;
  return Number(BigInt(hex)) / 10 ** decimals;
}

// last-good price cache (survives across requests) so BNB/token USD never flickers
// to $0 when CoinGecko is slow or rate-limited.
const priceCache: Record<string, number> = {};
let priceCacheTs = 0;

async function prices(): Promise<Record<string, number>> {
  const now = Date.now();
  if (now - priceCacheTs < 30_000 && Object.keys(priceCache).length) return priceCache;
  try {
    const ids = [...new Set(Object.values(CG_IDS))].join(",");
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { cache: "no-store" }
    );
    const j = await r.json();
    let got = false;
    for (const [sym, id] of Object.entries(CG_IDS)) {
      const v = j?.[id]?.usd;
      if (typeof v === "number" && v > 0) {
        priceCache[sym] = v;
        got = true;
      }
    }
    if (got) priceCacheTs = now;
  } catch {
    /* keep last-good cache */
  }
  return priceCache;
}

export async function GET() {
  const env = await readEnv();
  const address = env.TWAK_WALLET_ADDRESS || null;
  const tokens = await readAllowlistTokens();

  if (!address) {
    return NextResponse.json({ ok: false, address: null, native: null, tokens: [], totalUsd: 0 });
  }

  const addr = address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const px = await prices();

  // native BNB
  let nativeAmount = 0;
  try {
    nativeAmount = hexToNum(await rpc("eth_getBalance", [address, "latest"]), 18);
  } catch {
    /* keep 0 */
  }

  const balances = await Promise.all(
    tokens.map(async (t) => {
      let amount = 0;
      try {
        const data = "0x70a08231" + addr; // balanceOf(address)
        amount = hexToNum(await rpc("eth_call", [{ to: t.address, data }, "latest"]), t.decimals);
      } catch {
        /* keep 0 */
      }
      const usd = t.is_stable ? amount : amount * (px[t.symbol] ?? 0);
      return { symbol: t.symbol, amount, usd, isStable: t.is_stable };
    })
  );

  const native = { symbol: "BNB", amount: nativeAmount, usd: nativeAmount * (px.WBNB ?? 0) };
  const totalUsd = native.usd + balances.reduce((s, b) => s + b.usd, 0);

  // surface only non-zero token balances (+ always keep the base stables visible)
  const visible = balances.filter((b) => b.amount > 0 || b.isStable);

  return NextResponse.json({
    ok: true,
    address,
    chain: "bsc",
    native,
    tokens: visible,
    totalUsd,
    funded: totalUsd > 0.01,
  });
}
