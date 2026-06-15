"use client";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { money, short } from "@/lib/format";
import TokenIcon from "./TokenIcon";
import type { Portfolio } from "@/lib/types";

// display: trading-pair label (BNB/USDT, BTC/USDT, …)
const PAIR: Record<string, string> = { WBNB: "BNB", BTCB: "BTC", ETH: "ETH", SOL: "SOL", CAKE: "CAKE" };
const pairLabel = (sym: string) => PAIR[sym] ?? sym;
const STABLE = (s: string) => s === "USDT" || s === "USDC";

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
  const all = portfolio ? Object.values(portfolio.positions) : [];
  // stablecoin holdings are cash-like, not trades; only volatile tokens are "positions"
  const open = all.filter((p) => !STABLE(p.symbol));
  const stables = all.filter((p) => STABLE(p.symbol));
  const cash = portfolio?.cash_usd ?? 0;
  const realized = portfolio?.realized_pnl_usd ?? 0;
  const realizedUp = realized >= 0;

  return (
    <div className="glass flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
        <span className="label">positions · self-custody</span>
        <div className="flex items-center gap-2.5">
          {Math.abs(realized) > 0.004 && (
            <span className="tnum text-[10px] px-2 py-0.5 rounded-full"
              title="cumulative realized (banked) P&L this session"
              style={{ color: realizedUp ? "var(--color-mint)" : "var(--color-danger)",
                background: realizedUp ? "rgba(78,230,168,0.1)" : "rgba(255,93,108,0.1)" }}>
              banked {realizedUp ? "+" : "−"}{money(Math.abs(realized)).slice(1)}
            </span>
          )}
          <span className="label">{open.length} open</span>
        </div>
      </div>

      <div className="px-5 py-2 flex-1">
        {/* cash / dry powder */}
        <CashRow symbol={base} amount={cash} sub="cash · dry powder" />

        {/* stablecoin holdings — cash-like, shown neutrally (no P&L) */}
        {stables.map((p) => (
          <CashRow key={p.symbol} symbol={p.symbol} amount={p.qty * (prices[p.symbol] ?? 1)} sub="stable · cash" qty={p.qty} />
        ))}

        {/* open positions, as TOKEN/USDT pairs — marked live */}
        {open.map((p, i) => {
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
                    <span className="tnum text-[10px] text-[var(--color-faint)]">spot · entry {money(p.avg_price_usd)} · mark {money(mark)}</span>
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
        {open.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-10">
            <div className="h-11 w-11 rounded-full hairline flex items-center justify-center mb-3">
              <ShieldCheck size={18} className="text-[var(--color-mint)]" />
            </div>
            <div className="text-[14px]">No open positions</div>
            <p className="text-[12px] text-[var(--color-muted)] mt-1.5 max-w-[260px] leading-snug">
              Resting in stablecoins — <span className="text-[var(--color-mint)]">survival mode</span>. The agent deploys only on conviction.
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

function CashRow({ symbol, amount, sub, qty }: { symbol: string; amount: number; sub: string; qty?: number }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--color-line)]">
      <div className="flex items-center gap-3">
        <TokenIcon symbol={symbol} size={30} />
        <div>
          <div className="text-[14px]">{symbol}</div>
          <div className="text-[11px] text-[var(--color-faint)]">{sub}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="tnum text-[14px]">{money(amount)}</div>
        <div className="text-[11px] text-[var(--color-faint)] tnum">
          {qty != null ? `${qty.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${symbol}` : "available"}
        </div>
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
