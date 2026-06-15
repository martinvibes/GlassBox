"use client";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { VerdictChip } from "./ui";
import { timeAgo } from "@/lib/format";
import type { DecisionRecord, Action } from "@/lib/types";

const ACCENT: Record<Action, string> = {
  buy: "var(--color-mint)",
  sell: "var(--color-danger)",
  hold: "var(--color-faint)",
  swap: "var(--color-cyan)",
};
const GLYPH: Record<Action, string> = { buy: "▲", sell: "▼", hold: "■", swap: "⇄" };
const PAIR: Record<string, string> = { WBNB: "BNB", BTCB: "BTC", ETH: "ETH", SOL: "SOL", CAKE: "CAKE", USDT: "USDT", USDC: "USDC" };
const pl = (s: string) => PAIR[s] ?? s;

export default function ReasoningFeed() {
  const { data } = usePolling<{ decisions: DecisionRecord[] }>("/api/decisions?limit=40", 5000);
  const rows = data?.decisions ?? [];

  return (
    <div className="glass flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[var(--color-mint)] live-dot" />
          <span className="label">reasoning feed · live audit log</span>
        </div>
        <span className="label">{rows.length} records</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 && (
          <div className="text-[12px] text-[var(--color-faint)] p-5 tnum">
            awaiting decisions… run the agent to stream its reasoning here.
          </div>
        )}
        <AnimatePresence initial={false}>
          {rows.map((r) => {
            const a = r.proposal.action;
            const accent = ACCENT[a];
            const isAction = a !== "hold";
            const filled = r.execution?.ok && r.execution.notional_usd > 0;
            return (
              <motion.div
                key={r.cycle_id + r.ts}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="relative px-5 py-3.5 border-b border-[var(--color-line)] last:border-0 hover:bg-white/[0.015] transition-colors"
                style={{ opacity: isAction ? 1 : 0.62 }}
              >
                {/* left accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent, opacity: isAction ? 1 : 0.35 }} />

                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="tnum text-[10px] text-[var(--color-faint)]">#{r.cycle_id}</span>
                    <span className="tnum text-[13px] font-medium flex items-center gap-1.5" style={{ color: accent }}>
                      <span className="text-[10px]">{GLYPH[a]}</span>
                      {a.toUpperCase()}
                      {r.proposal.symbol && (
                        <span className="text-[var(--color-fg)]">
                          {pl(r.proposal.symbol)}<span className="text-[var(--color-faint)]">/USDT</span>
                        </span>
                      )}
                    </span>
                    {isAction && (
                      <span className="tnum text-[10px] text-[var(--color-faint)]">conv {r.proposal.conviction.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <VerdictChip verdict={r.decision.verdict} />
                    <span className="tnum text-[10px] text-[var(--color-faint)]">{timeAgo(r.ts)}</span>
                  </div>
                </div>

                <p className="text-[12px] text-[var(--color-muted)] leading-snug">{r.proposal.rationale}</p>

                {r.decision.reasons?.[0] && (
                  <div className="inline-flex items-center mt-2 px-2 py-0.5 rounded-md hairline tnum text-[10.5px] text-[var(--color-faint)]"
                    style={{ background: "rgba(255,255,255,0.02)" }}>
                    gate · {r.decision.reasons[0]}
                  </div>
                )}

                {filled && (() => {
                  const e = r.execution!;
                  const realized = e.realized_pnl_usd ?? 0;
                  const isClose = (e.action === "sell" || e.action === "swap") && Math.abs(realized) > 0.004;
                  const up = realized >= 0;
                  const pnlColor = up ? "var(--color-mint)" : "var(--color-danger)";
                  return (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <div className="flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full"
                        style={{ background: "rgba(78,230,168,0.1)", color: "var(--color-mint)" }}>
                        <CheckCircle2 size={12} />
                        <span className="tnum text-[10.5px]">
                          {isClose ? "closed" : "filled"} {e.action.toUpperCase()} {pl(e.symbol)} · ${e.notional_usd.toFixed(2)} @ {e.fill_price_usd}
                        </span>
                        {e.tx_hash && e.venue !== "paper" && (
                          <a href={`https://bscscan.com/tx/${e.tx_hash}`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center opacity-70 hover:opacity-100">
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                      {isClose && (
                        <div className="flex items-center gap-1 w-fit px-2.5 py-1 rounded-full"
                          style={{ background: up ? "rgba(78,230,168,0.12)" : "rgba(255,93,108,0.12)", color: pnlColor }}>
                          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          <span className="tnum text-[10.5px] font-semibold">
                            {up ? "+" : "−"}${Math.abs(realized).toFixed(2)} {up ? "profit" : "loss"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
