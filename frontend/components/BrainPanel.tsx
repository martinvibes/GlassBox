"use client";
import { Brain } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { money } from "@/lib/format";
import type { StatePayload } from "@/lib/types";

const LABEL: Record<string, string> = { WBNB: "BNB", BTCB: "BTC" };
const cl = (s: string) => LABEL[s] ?? s;

// The live, closed-loop memory the agent reasons over — thesis + per-token scorecard
// + lessons it has learned THIS session. (A competitor writes a static journal it never
// reads back; ours feeds straight into the next decision.)
export default function BrainPanel() {
  const { data } = usePolling<StatePayload>("/api/state", 4000);
  const b = data?.brain;
  if (!b || (!b.thesis && b.closedTrades === 0 && b.lessons.length === 0)) return null;

  const up = b.realizedTotal >= 0;
  const tokens = Object.entries(b.tokens).sort((a, c) => c[1].pnl - a[1].pnl);

  return (
    <div className="border-b border-[var(--color-line)] px-5 py-3.5" style={{ background: "rgba(182,155,255,0.035)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Brain size={14} style={{ color: "var(--color-violet)" }} />
          <span className="label">agent brain · live memory</span>
        </div>
        {b.closedTrades > 0 && (
          <span className="tnum text-[11px]" style={{ color: up ? "var(--color-mint)" : "var(--color-danger)" }}>
            session {up ? "+" : "−"}{money(Math.abs(b.realizedTotal)).slice(1)} · {b.closedTrades} closed
          </span>
        )}
      </div>

      {b.thesis && (
        <p className="text-[12.5px] text-[var(--color-fg)] leading-snug mb-2.5 display-italic" style={{ fontFamily: "var(--font-display)" }}>
          “{b.thesis}”
        </p>
      )}

      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tokens.map(([sym, t]) => {
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

      {b.lessons.length > 0 && (
        <div className="flex flex-col gap-1">
          {b.lessons.slice(0, 3).map((l, i) => (
            <div key={i} className="flex gap-1.5 text-[11px] text-[var(--color-muted)] leading-snug">
              <span style={{ color: "var(--color-violet)" }}>›</span>
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
