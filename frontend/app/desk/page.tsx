"use client";
import { motion } from "framer-motion";
import { usePolling } from "@/lib/usePolling";
import TopBar from "@/components/TopBar";
import TradingViewChart from "@/components/TradingViewChart";
import AgentConsole from "@/components/AgentConsole";
import DeskTabs from "@/components/DeskTabs";
import { money, signedPct } from "@/lib/format";
import type { StatePayload } from "@/lib/types";

function fngLabel(v: number | null): string {
  if (v == null) return "—";
  if (v <= 25) return "extreme fear";
  if (v <= 45) return "fear";
  if (v <= 55) return "neutral";
  if (v <= 75) return "greed";
  return "extreme greed";
}

export default function Page() {
  const { data } = usePolling<StatePayload>("/api/state", 5000);
  // live marks (refreshes every 5s) so open positions update in real time —
  // the decision log only carries prices from the agent's slow heartbeat.
  const { data: live } = usePolling<{ prices: Record<string, number> }>("/api/prices", 5000);

  // live marks override the stale decision-log prices
  const prices = { ...(data?.latest?.signals.prices_usd ?? {}), ...(live?.prices ?? {}) };

  // recompute equity + drawdown off live marks so the whole ribbon tracks price
  const portfolio = data?.portfolio ?? null;
  const equity = portfolio
    ? portfolio.cash_usd + Object.values(portfolio.positions).reduce((s, p) => s + p.qty * (prices[p.symbol] ?? p.avg_price_usd), 0)
    : (data?.equity ?? 1000);
  const start = data?.startEquity ?? 1000;
  const pnl = equity - start;
  const pnlPct = start > 0 ? (pnl / start) * 100 : 0;
  const up = pnl >= 0;
  const hwm = Math.max(portfolio?.high_water_mark_usd ?? equity, equity);
  const dd = hwm > 0 ? Math.max(0, ((hwm - equity) / hwm) * 100) : (data?.drawdownPct ?? 0);
  const ceiling = data?.internalCeilingPct ?? 12;
  const cap = data?.competitionCapPct ?? 30;
  const fng = data?.fearGreed ?? null;
  const regime = (data?.regime ?? "unknown").replace("_", "-");
  const pnlColor = up ? "var(--color-mint)" : "var(--color-danger)";

  return (
    <main className="relative min-h-screen px-4 md:px-6 py-5 max-w-[1480px] mx-auto z-10">
      <div className="grid-atmos fixed inset-0 -z-10 opacity-25" />

      <TopBar
        regime={data?.regime ?? "unknown"}
        mode={data?.mode ?? "paper"}
        wallet={data?.wallet ?? null}
        cycles={data?.cycles ?? 0}
      />

      {/* ── STAT RIBBON ── */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
        <Ribbon label="total equity" value={money(equity)} big delay={0.04} />
        <Ribbon label="net pnl" value={`${up ? "+" : "−"}${money(Math.abs(pnl)).slice(1)}`} sub={signedPct(pnlPct)} accent={pnlColor} delay={0.08} />
        <Ribbon label="drawdown" value={`${dd.toFixed(1)}%`} sub={`flatten ${ceiling}% · DQ ${cap}%`} accent="var(--color-mint)" delay={0.12} />
        <Ribbon label="regime" value={regime} sub="gate posture" delay={0.16} />
        <Ribbon label="fear & greed" value={fng ?? "—"} sub={fngLabel(fng)} accent="var(--color-amber)" delay={0.2} />
        <Ribbon label="cycles" value={String(data?.cycles ?? 0)} sub="decisions logged" accent="var(--color-cyan)" delay={0.24} />
      </section>

      {/* ── TRADE SURFACE: chart + agent console ── */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
        <Cell className="lg:col-span-8 h-[440px] lg:h-[560px]" delay={0.1}>
          <TradingViewChart />
        </Cell>
        <Cell className="lg:col-span-4 h-[560px]" delay={0.16}>
          <AgentConsole />
        </Cell>
      </section>

      {/* ── TABBED PANEL: reasoning · trades · positions · performance ── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6"
      >
        <DeskTabs
          portfolio={data?.portfolio ?? null}
          prices={prices}
          wallet={data?.wallet ?? null}
          agentId={data?.agentId ?? null}
          equitySeries={data?.equitySeries ?? []}
          start={start}
          dd={dd}
          ceiling={ceiling}
          cap={cap}
        />
      </motion.section>

      <footer className="text-center label py-6 opacity-50">
        GlassBox · transparent · risk-gated · BNB HACK Track 1 · the model proposes, the gate disposes
      </footer>
    </main>
  );
}

function Cell({ className, delay = 0, children }: { className?: string; delay?: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Ribbon({
  label, value, sub, accent, big, delay = 0,
}: {
  label: string; value: string | number; sub?: string; accent?: string; big?: boolean; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className="glass px-5 py-4"
    >
      <div className="label">{label}</div>
      <div
        className={`tnum font-semibold tracking-tight ${big ? "text-[32px]" : "text-[27px]"} mt-1.5 leading-none`}
        style={{ ...(accent ? { color: accent } : {}), ...(accent ? { textShadow: `0 0 22px ${accent}33` } : {}) }}
      >
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-[var(--color-faint)] mt-1.5 tnum">{sub}</div>}
    </motion.div>
  );
}
