// Token logo with a graceful colored-letter fallback.
const FILE: Record<string, string> = {
  BNB: "bnb", WBNB: "bnb",
  BTC: "btc", BTCB: "btc",
  ETH: "eth",
  CAKE: "cake",
  SOL: "sol",
  USDT: "usdt", USDC: "usdc",
};
const TINT: Record<string, string> = {
  BNB: "#f3ba2f", WBNB: "#f3ba2f",
  BTC: "#f7931a", BTCB: "#f7931a",
  ETH: "#627eea",
  CAKE: "#d1884f",
  SOL: "#14f195",
  USDT: "#26a17b", USDC: "#2775ca",
  XRP: "#23a2db", ADA: "#3468d1", DOGE: "#c2a633", DOT: "#e6007a", LINK: "#2a5ada",
  LTC: "#5b8fd6", MATIC: "#8247e5", AVAX: "#e84142", UNI: "#ff5fa0", ATOM: "#6f7390",
};

export default function TokenIcon({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const key = (symbol || "").toUpperCase();
  const file = FILE[key];
  if (file) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/tokens/${file}.png`}
        alt={symbol}
        width={size}
        height={size}
        className="rounded-full shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const tint = TINT[key] ?? "var(--color-muted)";
  return (
    <span
      className="rounded-full inline-flex items-center justify-center shrink-0 font-semibold"
      style={{ width: size, height: size, background: `${tint}22`, color: tint, fontSize: size * 0.4 }}
    >
      {key.slice(0, 2)}
    </span>
  );
}
