"use client";
import { ArrowRight, ExternalLink, Receipt } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { money, timeAgo } from "@/lib/format";
import TokenIcon from "./TokenIcon";
import type { DecisionRecord } from "@/lib/types";

const BASE = "USDT";
const PAIR: Record<string, string> = { WBNB: "BNB", BTCB: "BTC", ETH: "ETH", SOL: "SOL", CAKE: "CAKE", USDT: "USDT", USDC: "USDC" };
const pl = (s: string) => PAIR[s] ?? s;

export default function TxHistory() {
  // fills=true → the FULL trade history (server scans the whole audit log), so trades
  // never disappear behind the agent's HOLD cycles. Already executed-only + newest-first.
  const { data } = usePolling<{ decisions: DecisionRecord[] }>("/api/decisions?fills=true", 6000);
  const fills = (data?.decisions ?? []).filter(
    (r) => r.execution?.ok && r.execution.notional_usd > 0 && r.execution.action !== "hold"
  );
  const net = fills.reduce((a, r) => a + (r.execution?.realized_pnl_usd ?? 0), 0);
  const netUp = net >= 0;

  return (
    <div className="glass flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2">
          <Receipt size={14} className="text-[var(--color-mint)]" />
          <span className="label">transaction history</span>
        </div>
        <div className="flex items-center gap-3">
          {Math.abs(net) > 0.004 && (
            <span className="tnum text-[11px]" style={{ color: netUp ? "var(--color-mint)" : "var(--color-danger)" }}>
              net {netUp ? "+" : "−"}${Math.abs(net).toFixed(2)}
            </span>
          )}
          <span className="label">{fills.length} fills</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {fills.length === 0 && (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--color-faint)]">
            No trades yet. Executed trades will appear here.
          </div>
        )}
        {fills.map((r) => {
          const e = r.execution!;
          // convert (token→token utility) vs trade (buy/sell a pair)
          const isConvert = e.action === "swap" && r.decision.from_symbol !== BASE && e.symbol !== BASE;
          const isBuy = e.action === "buy" || (e.action === "swap" && r.decision.from_symbol === BASE);
          const label = isConvert ? "CONVERT" : isBuy ? "BUY" : "SELL";
          const tradeSym = e.action === "swap" ? (isBuy ? e.symbol : r.decision.from_symbol || e.symbol) : e.symbol;
          const tx = e.tx_hash ?? "";
          const isPaper = tx.startsWith("0xpaper") || e.venue === "paper";
          const isClose = e.action === "sell" || (e.action === "swap" && !isBuy);
          const realized = e.realized_pnl_usd ?? 0;
          const showPnl = isClose && Math.abs(realized) > 0.004;
          const up = realized >= 0;
          return (
            <div
              key={`${r.cycle_id}-${r.ts}`}
              className="px-5 py-3.5 border-b border-[var(--color-line)] last:border-0 flex items-center gap-4"
            >
              <span
                className="tnum text-[11px] px-2 py-0.5 rounded-md shrink-0 w-[58px] text-center"
                style={{
                  color: isConvert ? "var(--color-cyan)" : isBuy ? "var(--color-mint)" : "var(--color-danger)",
                  background: isConvert ? "rgba(87,199,255,0.1)" : isBuy ? "rgba(78,230,168,0.1)" : "rgba(255,93,108,0.1)",
                }}
              >
                {label}
              </span>

              {isConvert ? (
                <div className="flex items-center gap-1.5 text-[13px] flex-1">
                  <TokenIcon symbol={r.decision.from_symbol || ""} size={18} />
                  <span>{pl(r.decision.from_symbol || "")}</span>
                  <ArrowRight size={12} className="text-[var(--color-faint)]" />
                  <TokenIcon symbol={e.symbol} size={18} />
                  <span>{pl(e.symbol)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[13.5px] flex-1">
                  <TokenIcon symbol={tradeSym} size={20} />
                  <span>{pl(tradeSym)}<span className="text-[var(--color-faint)]">/{BASE}</span></span>
                </div>
              )}

              <div className="text-right">
                <div className="tnum text-[13px]">{money(e.notional_usd)}</div>
                {showPnl ? (
                  <div className="tnum text-[11px] font-medium" style={{ color: up ? "var(--color-mint)" : "var(--color-danger)" }}>
                    {up ? "+" : "−"}${Math.abs(realized).toFixed(2)} {up ? "profit" : "loss"}
                  </div>
                ) : (
                  <div className="tnum text-[10px] text-[var(--color-faint)]">
                    {e.filled_qty.toLocaleString("en-US", { maximumFractionDigits: 5 })} {pl(e.symbol)} @ {money(e.fill_price_usd)}
                  </div>
                )}
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
