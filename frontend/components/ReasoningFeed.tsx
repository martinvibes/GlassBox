"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePolling } from "@/lib/usePolling";
import { VerdictChip, ActionGlyph } from "./ui";
import { timeAgo } from "@/lib/format";
import type { DecisionRecord } from "@/lib/types";

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

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {rows.length === 0 && (
          <div className="text-[12px] text-[var(--color-faint)] p-4 tnum">
            awaiting decisions… run the agent to stream its reasoning here.
          </div>
        )}
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.div
              key={r.cycle_id + r.ts}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="px-2.5 py-3 border-b border-[var(--color-line)] last:border-0 hover:bg-white/[0.015] rounded-md transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="tnum text-[10px] text-[var(--color-faint)]">#{r.cycle_id}</span>
                  <ActionGlyph action={r.proposal.action} />
                  {r.proposal.symbol && (
                    <span className="tnum text-[11px] text-[var(--color-fg)]">{r.proposal.symbol}</span>
                  )}
                  <span className="tnum text-[10px] text-[var(--color-faint)]">
                    conv {r.proposal.conviction.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <VerdictChip verdict={r.decision.verdict} />
                  <span className="tnum text-[10px] text-[var(--color-faint)]">{timeAgo(r.ts)}</span>
                </div>
              </div>
              <p className="text-[12px] text-[var(--color-muted)] leading-snug">{r.proposal.rationale}</p>
              {r.decision.reasons?.[0] && (
                <p className="tnum text-[10.5px] text-[var(--color-faint)] mt-1.5 pl-2 border-l border-[var(--color-line-bright)]">
                  ↳ {r.decision.reasons[0]}
                </p>
              )}
              {r.execution?.ok && r.execution.notional_usd > 0 && (
                <p className="tnum text-[10.5px] mt-1.5" style={{ color: "var(--color-mint)" }}>
                  ✓ filled {r.execution.action} {r.execution.symbol} ·{" "}
                  ${r.execution.notional_usd.toFixed(2)} @ {r.execution.fill_price_usd}
                  {r.execution.tx_hash && r.execution.venue !== "paper" && (
                    <a
                      href={`https://bscscan.com/tx/${r.execution.tx_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 underline opacity-70 hover:opacity-100"
                    >
                      tx ↗
                    </a>
                  )}
                </p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
