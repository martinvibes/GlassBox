"use client";
import { ArrowRight, ExternalLink, Receipt } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { money, timeAgo } from "@/lib/format";
import type { DecisionRecord } from "@/lib/types";

const BASE = "USDT";

export default function TxHistory() {
  const { data } = usePolling<{ decisions: DecisionRecord[] }>("/api/decisions?limit=80", 6000);
  const fills = (data?.decisions ?? [])
    .filter((r) => r.execution?.ok && r.execution.notional_usd > 0 && r.execution.action !== "hold")
    .reverse(); // newest first

  return (
    <div className="glass flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2">
          <Receipt size={14} className="text-[var(--color-mint)]" />
          <span className="label">transaction history</span>
        </div>
        <span className="label">{fills.length} fills</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {fills.length === 0 && (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--color-faint)]">
            No trades yet. Executed swaps will appear here.
          </div>
        )}
        {fills.map((r) => {
          const e = r.execution!;
          const isBuy = e.action === "buy";
          const from = isBuy ? BASE : e.symbol;
          const to = isBuy ? e.symbol : BASE;
          const tx = e.tx_hash ?? "";
          const isPaper = tx.startsWith("0xpaper") || e.venue === "paper";
          return (
            <div
              key={`${r.cycle_id}-${r.ts}`}
              className="px-5 py-3.5 border-b border-[var(--color-line)] last:border-0 flex items-center gap-4"
            >
              <span
                className="tnum text-[11px] px-2 py-0.5 rounded-md shrink-0"
                style={{
                  color: isBuy ? "var(--color-mint)" : "var(--color-danger)",
                  background: isBuy ? "rgba(78,230,168,0.1)" : "rgba(255,93,108,0.1)",
                }}
              >
                {e.action.toUpperCase()}
              </span>

              <div className="flex items-center gap-1.5 text-[13px] flex-1">
                <span className="text-[var(--color-fg)]">{from}</span>
                <ArrowRight size={12} className="text-[var(--color-faint)]" />
                <span className="text-[var(--color-fg)]">{to}</span>
              </div>

              <div className="text-right">
                <div className="tnum text-[13px]">{money(e.notional_usd)}</div>
                <div className="tnum text-[10px] text-[var(--color-faint)]">
                  {e.filled_qty.toLocaleString("en-US", { maximumFractionDigits: 5 })} {e.symbol} @ {money(e.fill_price_usd)}
                </div>
              </div>

              <div className="text-right w-[64px] shrink-0">
                <div className="tnum text-[10px] text-[var(--color-faint)]">{timeAgo(r.ts)}</div>
                {isPaper ? (
                  <span className="label">paper</span>
                ) : (
                  <a
                    href={`https://bscscan.com/tx/${tx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-[10px] text-[var(--color-mint)] hover:underline"
                  >
                    tx <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
