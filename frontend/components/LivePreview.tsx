"use client";
import { usePolling } from "@/lib/usePolling";
import { money, signedPct, timeAgo } from "@/lib/format";
import type { StatePayload, DecisionRecord, Action } from "@/lib/types";

const ACTION_COLOR: Record<Action, string> = {
  buy: "var(--color-mint)",
  sell: "var(--color-danger)",
  hold: "var(--color-faint)",
};

function Sparkline({ series, up }: { series: { t: number; v: number }[]; up: boolean }) {
  if (series.length < 2) {
    return <div className="h-full w-full flex items-center justify-center text-[10px] text-[var(--color-faint)] tnum">no data yet</div>;
  }
  const vals = series.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 100;
  const H = 32;
  const pts = series.map((p, i) => {
    const x = (i / (series.length - 1)) * W;
    const y = H - ((p.v - min) / range) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const color = up ? "var(--color-mint)" : "var(--color-danger)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function LivePreview() {
  const { data } = usePolling<StatePayload>("/api/state", 6000);
  const { data: dec } = usePolling<{ decisions: DecisionRecord[] }>("/api/decisions?limit=4", 6000);

  const equity = data?.equity ?? 1000;
  const start = data?.startEquity ?? 1000;
  const pnlPct = start > 0 ? ((equity - start) / start) * 100 : 0;
  const up = pnlPct >= 0;
  const dd = data?.drawdownPct ?? 0;
  const cap = data?.competitionCapPct ?? 30;
  const rows = dec?.decisions ?? [];
  const running = data ? !data.paused : true;

  return (
    <div className="glass overflow-hidden">
      {/* window chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-line)]">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
        <div className="flex-1 text-center">
          <span className="tnum text-[11px] text-[var(--color-faint)]">glassbox.app / desk</span>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: "rgba(78,230,168,0.1)" }}>
          <span className="h-1.5 w-1.5 rounded-full live-dot" style={{ background: "var(--color-mint)" }} />
          <span className="label" style={{ color: "var(--color-mint)" }}>{running ? "live" : "paused"}</span>
        </div>
      </div>

      {/* body */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-px bg-[var(--color-line)]">
        {/* left: equity + drawdown */}
        <div className="md:col-span-5 bg-[var(--color-void)]/40 p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="label">total equity</div>
            <div className="display text-[40px] leading-none mt-1 glow-mint">{money(equity)}</div>
            <div className="tnum text-[13px] mt-1.5" style={{ color: up ? "var(--color-mint)" : "var(--color-danger)" }}>
              {signedPct(pnlPct)} net
            </div>
          </div>
          <div className="h-10">
            <Sparkline series={data?.equitySeries ?? []} up={up} />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="label">drawdown</div>
              <div className="tnum text-[22px] mt-1" style={{ color: "var(--color-mint)" }}>{dd.toFixed(1)}%</div>
            </div>
            <div className="text-right">
              <div className="label">dq line</div>
              <div className="tnum text-[14px] mt-1" style={{ color: "var(--color-danger)" }}>{cap}%</div>
            </div>
          </div>
        </div>

        {/* right: live reasoning feed */}
        <div className="md:col-span-7 bg-[var(--color-void)]/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="label">reasoning feed · live</span>
            <span className="label">{data?.regime?.replace("_", "-") ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {rows.length === 0 && (
              <div className="text-[12px] text-[var(--color-faint)] tnum">awaiting decisions…</div>
            )}
            {rows.slice(0, 4).map((r) => (
              <div key={r.cycle_id + r.ts} className="flex items-start gap-2.5">
                <span className="tnum text-[11px] mt-0.5 shrink-0" style={{ color: ACTION_COLOR[r.proposal.action] }}>
                  {r.proposal.action.toUpperCase()}
                </span>
                <p className="text-[11.5px] text-[var(--color-muted)] leading-snug line-clamp-1 flex-1">
                  {r.proposal.rationale}
                </p>
                <span className="tnum text-[10px] text-[var(--color-faint)] shrink-0">{timeAgo(r.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
