"use client";
import { motion } from "framer-motion";
import { money, short } from "@/lib/format";
import type { Portfolio } from "@/lib/types";

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
  const positions = portfolio ? Object.values(portfolio.positions) : [];
  const cash = portfolio?.cash_usd ?? 0;

  return (
    <div className="glass flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
        <span className="label">positions · self-custody</span>
        <span className="label">{positions.length + 1} holdings</span>
      </div>

      <div className="px-5 py-3">
        <Row
          name={portfolio?.base_currency ?? "USDT"}
          tag="cash · stablecoin"
          qty={cash}
          value={cash}
          accent="var(--color-cyan)"
        />
        {positions.map((p, i) => {
          const mark = prices[p.symbol] ?? p.avg_price_usd;
          const val = p.qty * mark;
          const pnl = ((mark - p.avg_price_usd) / p.avg_price_usd) * 100;
          return (
            <motion.div
              key={p.symbol}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 * i }}
            >
              <Row
                name={p.symbol}
                tag={`avg ${money(p.avg_price_usd)} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%`}
                qty={p.qty}
                value={val}
                accent={pnl >= 0 ? "var(--color-mint)" : "var(--color-danger)"}
              />
            </motion.div>
          );
        })}
        {positions.length === 0 && (
          <div className="text-[11px] text-[var(--color-faint)] mt-2 mb-1 tnum">
            flat — resting in stablecoin (survival mode)
          </div>
        )}
      </div>

      <div className="mt-auto px-5 py-3.5 border-t border-[var(--color-line)] flex items-center justify-between flex-wrap gap-2">
        <Proof k="wallet" v={short(wallet, 5)} href={wallet ? `https://bscscan.com/address/${wallet}` : undefined} />
        <Proof k="erc-8004 id" v={agentId ? short(agentId, 5) : "unregistered"} />
        <Proof k="chain" v="bsc · 56" />
      </div>
    </div>
  );
}

function Row({
  name,
  tag,
  qty,
  value,
  accent,
}: {
  name: string;
  tag: string;
  qty: number;
  value: number;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--color-line)] last:border-0">
      <div className="flex items-center gap-3">
        <div
          className="h-7 w-7 rounded-full hairline flex items-center justify-center tnum text-[10px]"
          style={{ color: accent }}
        >
          {name.slice(0, 3)}
        </div>
        <div>
          <div className="tnum text-[13px]">{name}</div>
          <div className="tnum text-[10px] text-[var(--color-faint)]">{tag}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="tnum text-[13px]">{money(value)}</div>
        <div className="tnum text-[10px] text-[var(--color-faint)]">
          {qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}
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
    <a href={href} target="_blank" rel="noreferrer" className="hover:opacity-80 transition-opacity">
      {inner}
    </a>
  ) : (
    inner
  );
}
