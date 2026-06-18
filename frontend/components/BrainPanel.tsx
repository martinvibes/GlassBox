"use client";
import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { money } from "@/lib/format";
import type { StatePayload } from "@/lib/types";

const LABEL: Record<string, string> = { WBNB: "BNB", BTCB: "BTC" };
const cl = (s: string) => LABEL[s] ?? s;
const STABLE = (s: string) => s === "USDT" || s === "USDC";

// The live, closed-loop memory the agent reasons over. Compact by default (stats +
// thesis + scorecard) so it never buries the reasoning feed; expands to the full
// thesis + lessons on demand.
export default function BrainPanel() {
  const { data } = usePolling<StatePayload>("/api/state", 4000);
  const [open, setOpen] = useState(false);
  const b = data?.brain;
  if (!b || (!b.thesis && b.closedTrades === 0 && b.lessons.length === 0)) return null;

  const up = b.realizedTotal >= 0;
  const tokens = Object.entries(b.tokens).sort((a, c) => c[1].pnl - a[1].pnl);
  const openPos = data?.portfolio ? Object.keys(data.portfolio.positions).filter((s) => !STABLE(s)).length : 0;
  const wins = Object.values(b.tokens).reduce((a, t) => a + t.wins, 0);
  const losses = Object.values(b.tokens).reduce((a, t) => a + t.losses, 0);
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null;

  return (
    <div className="border-b border-[var(--color-line)] px-5 py-3" style={{ background: "rgba(182,155,255,0.04)" }}>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center justify-between w-full group mb-2.5">
        <div className="flex items-center gap-2">
          <Brain size={13} style={{ color: "var(--color-violet)" }} />
          <span className="label">agent brain · live memory</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="label group-hover:text-[var(--color-muted)] transition-colors">{open ? "less" : "details"}</span>
          <ChevronDown size={13} className="text-[var(--color-faint)] transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </div>
      </button>

      {/* compact stats row — always visible */}
      <div className="flex items-center gap-5 mb-2.5 flex-wrap">
        <Stat label="open" value={String(openPos)} />
        <Stat label="closed" value={String(b.closedTrades)} />
        {winRate != null && <Stat label="win" value={`${winRate}%`} accent="var(--color-cyan)" />}
        <Stat label="session" value={`${up ? "+" : "−"}${money(Math.abs(b.realizedTotal)).slice(1)}`}
          accent={up ? "var(--color-mint)" : "var(--color-danger)"} />
      </div>

      {/* thesis — clamped to 2 lines until expanded */}
      {b.thesis && (
        <p
          className={`text-[12.5px] text-[var(--color-fg)] leading-relaxed pl-2.5 border-l-2 ${open ? "" : "line-clamp-2"} mb-1`}
          style={{ fontFamily: "var(--font-sans)", letterSpacing: "-0.006em", borderColor: "rgba(182,155,255,0.5)" }}
        >
          {b.thesis}
        </p>
      )}

      {/* per-token scorecard — always visible, compact */}
      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tokens.slice(0, open ? 99 : 5).map(([sym, t]) => {
            const tu = t.pnl >= 0;
            return (
              <span key={sym} className="tnum text-[10px] px-2 py-0.5 rounded-full hairline inline-flex items-center gap-1"
                title={`${cl(sym)} this session`}
                style={{ color: tu ? "var(--color-mint)" : "var(--color-danger)", background: "rgba(255,255,255,0.02)" }}>
                {cl(sym)} {t.wins}W/{t.losses}L {tu ? "+" : "−"}{Math.abs(t.pnl).toFixed(2)}
                {t.stops > 0 && <span style={{ color: "var(--color-amber)" }} title={`stopped out ${t.stops}x`}>⚠{t.stops}</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* lessons — only when expanded (they're the verbose part) */}
      {open && b.lessons.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-[var(--color-line)]">
          <span className="label mb-0.5">lessons learned</span>
          {b.lessons.slice(0, 4).map((l, i) => (
            <div key={i} className="flex gap-1.5 text-[11px] text-[var(--color-muted)] leading-relaxed">
              <span style={{ color: "var(--color-violet)" }}>›</span>
              <span style={{ fontFamily: "var(--font-sans)" }}>{l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label" style={{ fontSize: 9, letterSpacing: "0.18em" }}>{label}</span>
      <span className="tnum text-[15px] font-semibold leading-none" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}
