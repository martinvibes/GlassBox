export const money = (n: number | null | undefined, dp = 2): string =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const compact = (n: number | null | undefined): string =>
  n == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const pct = (n: number | null | undefined, dp = 2): string =>
  n == null ? "—" : `${n >= 0 ? "" : ""}${n.toFixed(dp)}%`;

export const signedPct = (n: number, dp = 2): string =>
  `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function clockUTC(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toISOString().slice(11, 19) + "Z";
}

export const short = (a?: string | null, n = 4): string =>
  !a ? "—" : a.length <= n * 2 + 2 ? a : `${a.slice(0, n + 2)}…${a.slice(-n)}`;
