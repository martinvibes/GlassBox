"use client";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { money, short } from "@/lib/format";
import TokenIcon from "./TokenIcon";
import type { Portfolio } from "@/lib/types";

// display: trading-pair label (BNB/USDT, BTC/USDT, …)
const PAIR: Record<string, string> = { WBNB: "BNB", BTCB: "BTC", ETH: "ETH", SOL: "SOL", CAKE: "CAKE" };
const pairLabel = (sym: string) => PAIR[sym] ?? sym;

export default function Positions({
  portfolio,
  prices,
  wallet,
  agentId,
}: {
  portfolio: Portfolio | null;
  prices: Record<string, number>;
  wallet: string | null;
  agentId: string | null;
}) {
  const base = portfolio?.base_currency ?? "USDT";
  const positions = portfolio ? Object.values(portfolio.positions) : [];
  const cash = portfolio?.cash_usd ?? 0;

  return (
    <div className="glass flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
        <span className="label">positions · self-custody</span>
        <span className="label">{positions.length} open</span>
      </div>

      <div className="px-5 py-2 flex-1">
        {/* cash / dry powder */}
        <div className="flex items-center justify-between py-3 border-b border-[var(--color-line)]">
          <div className="flex items-center gap-3">
            <TokenIcon symbol={base} size={30} />
            <div>
              <div className="text-[14px]">{base}</div>
              <div className="text-[11px] text-[var(--color-faint)]">cash · dry powder</div>
            </div>
          </div>
          <div className="text-right">
            <div className="tnum text-[14px]">{money(cash)}</div>
            <div className="text-[11px] text-[var(--color-faint)]">available</div>
          </div>
        </div>

        {/* open positions, as TOKEN/USDT pairs */}
        {positions.map((p, i) => {
          const mark = prices[p.symbol] ?? p.avg_price_usd;
          const val = p.qty * mark;
          const pnlPct = ((mark - p.avg_price_usd) / p.avg_price_usd) * 100;
          const pnlUsd = p.qty * (mark - p.avg_price_usd);
          const up = pnlPct >= 0;
          const c = up ? "var(--color-mint)" : "var(--color-danger)";
          return (
            <motion.div key={p.symbol} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 * i }}
              className="flex items-center justify-between py-3 border-b border-[var(--color-line)] last:border-0">
              <div className="flex items-center gap-3">
                <TokenIcon symbol={p.symbol} size={30} />
                <div>
                  <div className="text-[14px]">
                    {pairLabel(p.symbol)}<span className="text-[var(--color-faint)]">/{base}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="tnum text-[9px] px-1.5 py-0.5 rounded" style={{ color: "var(--color-mint)", background: "rgba(78,230,168,0.1)" }}>LONG</span>
                    <span className="tnum text-[10px] text-[var(--color-faint)]">spot · entry {money(p.avg_price_usd)}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="tnum text-[14px]">{money(val)}</div>
                <div className="tnum text-[11px]" style={{ color: c }}>
                  {up ? "+" : "−"}{Math.abs(pnlPct).toFixed(2)}% · {up ? "+" : "−"}{money(Math.abs(pnlUsd)).slice(1)}
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* flat state */}
        {positions.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-10">
            <div className="h-11 w-11 rounded-full hairline flex items-center justify-center mb-3">
              <ShieldCheck size={18} className="text-[var(--color-mint)]" />
            </div>
            <div className="text-[14px]">No open positions</div>
            <p className="text-[12px] text-[var(--color-muted)] mt-1.5 max-w-[260px] leading-snug">
              Resting 100% in {base} — <span className="text-[var(--color-mint)]">survival mode</span>. The agent deploys only on conviction.
            </p>
          </div>
        )}
      </div>

      <div className="px-5 py-3.5 border-t border-[var(--color-line)] flex items-center justify-between flex-wrap gap-2">
        <Proof k="wallet" v={short(wallet, 5)} href={wallet ? `https://bscscan.com/address/${wallet}` : undefined} />
        <Proof k="erc-8004 id" v={agentId ? short(agentId, 5) : "unregistered"} />
        <Proof k="chain" v="bsc · 56" />
      </div>
    </div>
  );
}

function Proof({ k, v, href }: { k: string; v: string; href?: string }) {
  const inner = (
    <div className="flex flex-col">
      <span className="label">{k}</span>
      <span className="tnum text-[11px] text-[var(--color-muted)]">{v}</span>
    </div>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="hover:opacity-80 transition-opacity">{inner}</a>
  ) : inner;
}
