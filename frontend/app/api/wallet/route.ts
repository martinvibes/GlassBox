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

async function prices(symbols: string[]): Promise<Record<string, number>> {
  const ids = symbols.map((s) => CG_IDS[s]).filter(Boolean);
  if (!ids.length) return {};
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${[...new Set(ids)].join(",")}&vs_currencies=usd`,
      { cache: "no-store" }
    );
    const j = await r.json();
    const out: Record<string, number> = {};
    for (const [sym, id] of Object.entries(CG_IDS)) out[sym] = j[id]?.usd ?? 0;
    return out;
  } catch {
    return {};
  }
}

export async function GET() {
  const env = await readEnv();
  const address = env.TWAK_WALLET_ADDRESS || null;
  const tokens = await readAllowlistTokens();

  if (!address) {
    return NextResponse.json({ ok: false, address: null, native: null, tokens: [], totalUsd: 0 });
  }

  const addr = address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const px = await prices(Object.keys(CG_IDS));

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
