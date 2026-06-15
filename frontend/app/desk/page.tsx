"use client";
import { motion } from "framer-motion";
import { usePolling } from "@/lib/usePolling";
import TopBar from "@/components/TopBar";
import DrawdownGauge from "@/components/DrawdownGauge";
import TradingViewChart from "@/components/TradingViewChart";
import AgentConsole from "@/components/AgentConsole";
import EquityChart from "@/components/EquityChart";
import ReasoningFeed from "@/components/ReasoningFeed";
import Positions from "@/components/Positions";
import WalletPanel from "@/components/WalletPanel";
import TxHistory from "@/components/TxHistory";
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

  const equity = data?.equity ?? 1000;
  const start = data?.startEquity ?? 1000;
  const pnl = equity - start;
  const pnlPct = start > 0 ? (pnl / start) * 100 : 0;
  const up = pnl >= 0;
  const dd = data?.drawdownPct ?? 0;
  const ceiling = data?.internalCeilingPct ?? 12;
  const cap = data?.competitionCapPct ?? 30;
  const prices = data?.latest?.signals.prices_usd ?? {};
  const fng = data?.fearGreed ?? null;
  const regime = (data?.regime ?? "unknown").replace("_", "-");
  const pnlColor = up ? "var(--color-mint)" : "var(--color-danger)";

  return (
    <main className="relative min-h-screen px-4 md:px-6 py-5 max-w-[1560px] mx-auto z-10">
      <div className="grid-atmos fixed inset-0 -z-10 opacity-30" />

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

      {/* ── TRADE SURFACE ── */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
        <Cell className="lg:col-span-8 h-[440px] lg:h-[540px]" delay={0.1}>
          <TradingViewChart />
        </Cell>
        <Cell className="lg:col-span-4 h-[540px]" delay={0.16}>
          <AgentConsole />
        </Cell>
      </section>

      {/* ── INTELLIGENCE: reasoning feed + survival gauge ── */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
        <Cell className="lg:col-span-8 h-[440px]" delay={0.2}>
          <ReasoningFeed />
        </Cell>
        <Cell className="lg:col-span-4 h-[440px]" delay={0.24}>
          <div className="glass h-full p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <span className="absolute top-5 left-6 label">survival monitor</span>
            <div className="scale-[0.92] origin-center">
              <DrawdownGauge dd={dd} ceiling={ceiling} cap={cap} />
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Chip label={`flatten ${ceiling}%`} color="var(--color-amber)" />
              <Chip label={`DQ ${cap}%`} color="var(--color-danger)" />
            </div>
            <p className="text-[12px] text-[var(--color-muted)] text-center mt-3 max-w-[280px] leading-snug">
              Auto-flattens far inside the line. <span className="text-[var(--color-mint)]">Survival is the alpha.</span>
            </p>
          </div>
        </Cell>
      </section>

      {/* ── WALLET + LEDGER ── */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
        <Cell className="lg:col-span-4 h-[420px]" delay={0.28}>
          <WalletPanel />
        </Cell>
        <Cell className="lg:col-span-8 h-[420px]" delay={0.32}>
          <TxHistory />
        </Cell>
      </section>

      {/* ── HOLDINGS + EQUITY CURVE ── */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4 mb-8">
        <Cell className="lg:col-span-4 h-[300px]" delay={0.36}>
          <Positions
            portfolio={data?.portfolio ?? null}
            prices={prices}
            wallet={data?.wallet ?? null}
            agentId={data?.agentId ?? null}
          />
        </Cell>
        <Cell className="lg:col-span-8 h-[300px]" delay={0.4}>
          <EquityChart series={data?.equitySeries ?? []} start={start} />
        </Cell>
      </section>

      <footer className="text-center label py-5 opacity-50">
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
      className="glass px-5 py-3.5"
    >
      <div className="label">{label}</div>
      <div className={`tnum ${big ? "text-[24px]" : "text-[20px]"} mt-1 leading-none`} style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-[var(--color-faint)] mt-1.5 tnum">{sub}</div>}
    </motion.div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="tnum text-[10px] px-2 py-0.5 rounded-full"
      style={{ color, background: `${color}1a` }}
    >
      {label}
    </span>
  );
}
