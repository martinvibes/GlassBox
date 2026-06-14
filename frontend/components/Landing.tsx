"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, ShieldCheck, Layers, ArrowRight, Lock } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import Spotlight from "@/components/Spotlight";
import LivePreview from "@/components/LivePreview";
import LogoMarquee from "@/components/LogoMarquee";
import DrawdownGauge from "@/components/DrawdownGauge";
import { money, signedPct } from "@/lib/format";
import type { StatePayload } from "@/lib/types";

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
};

export default function Landing({ background }: { background?: React.ReactNode }) {
  const { data } = usePolling<StatePayload>("/api/state", 8000);
  const equity = data?.equity ?? 1000;
  const start = data?.startEquity ?? 1000;
  const pnlPct = start > 0 ? ((equity - start) / start) * 100 : 0;
  const dd = data?.drawdownPct ?? 0;
  const regime = data?.regime ?? "unknown";

  return (
    <main className="relative z-10 overflow-hidden">
      {/* ───────────────────────── HERO ───────────────────────── */}
      <section className="relative">
        {background ?? <Spotlight className="!h-[120%]" />}
        <div className="relative max-w-[1100px] mx-auto px-5 md:px-8 pt-24 md:pt-32 pb-16 text-center">
          <div
            className="anim anim-fade inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 hairline mb-8"
            style={{ background: "rgba(255,255,255,0.025)", animationDelay: "0.05s" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-mint)] live-dot" />
            <span className="label">Autonomous trading agent · BNB Chain</span>
          </div>

          <h1 className="display text-[clamp(52px,9.5vw,116px)] leading-[0.88] tracking-tight">
            <span className="block anim anim-rise" style={{ animationDelay: "0.15s" }}>
              Survival is
            </span>
            <span className="block anim anim-rise -mt-1 md:-mt-2" style={{ animationDelay: "0.32s" }}>
              the{" "}
              <span className="italic glow-mint" style={{ color: "var(--color-mint)" }}>
                alpha.
              </span>
            </span>
          </h1>

          <p
            className="anim anim-fade text-[var(--color-muted)] text-[17px] md:text-[20px] leading-relaxed mt-7 max-w-[600px] mx-auto"
            style={{ animationDelay: "0.55s" }}
          >
            A transparent, risk-gated agent that reads the market, reasons in the open, and survives
            the drawdown gate that disqualifies everyone else. The model proposes — the gate disposes.
          </p>

          <div
            className="anim anim-fade flex items-center justify-center gap-3 mt-9 flex-wrap"
            style={{ animationDelay: "0.7s" }}
          >
            <Link
              href="/desk"
              className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold transition-transform hover:scale-[1.03] active:scale-95"
              style={{ background: "var(--color-mint)", color: "#08080b", boxShadow: "0 0 40px -8px var(--color-mint)" }}
            >
              Enter the desk
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/strategy"
              className="inline-flex items-center rounded-full px-6 py-3 text-[14px] hairline text-[var(--color-fg)] hover:bg-white/[0.04] transition-colors"
            >
              How it works
            </Link>
          </div>

          {/* live stat strip */}
          <div
            className="anim anim-fade inline-flex items-center gap-6 md:gap-9 mt-14 px-7 py-4 rounded-2xl hairline"
            style={{ background: "rgba(255,255,255,0.02)", animationDelay: "0.85s" }}
          >
            <Stat k="live equity" v={money(equity, 0)} />
            <Dot />
            <Stat k="net pnl" v={signedPct(pnlPct)} c={pnlPct >= 0 ? "var(--color-mint)" : "var(--color-danger)"} />
            <Dot />
            <Stat k="drawdown" v={`${dd.toFixed(1)}%`} c="var(--color-mint)" />
            <Dot />
            <Stat k="regime" v={regime.replace("_", "-")} />
          </div>
        </div>

        {/* live product preview */}
        <motion.div {...reveal} className="relative max-w-[1080px] mx-auto px-5 md:px-8 pb-24">
          <div
            className="absolute -top-10 left-1/2 -translate-x-1/2 w-[80%] h-32 blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(closest-side, rgba(78,230,168,0.18), transparent)" }}
          />
          <div className="relative">
            <LivePreview />
          </div>
          <p className="text-center label mt-5">a real, running agent — not a screenshot</p>
        </motion.div>
      </section>

      {/* ───────────────────────── STACK MARQUEE ───────────────────────── */}
      <section className="border-y border-[var(--color-line)] py-8">
        <div className="text-center label mb-5">powered by</div>
        <div className="max-w-[860px] mx-auto px-5">
          <LogoMarquee />
        </div>
      </section>

      {/* ───────────────────────── FEATURES ───────────────────────── */}
      <section className="max-w-[1180px] mx-auto px-5 md:px-8 py-24 flex flex-col gap-28">
        <Feature
          icon={Eye}
          eyebrow="Transparent"
          title="Reasons in the open."
          body="Every decision is a human-readable, hash-chained artifact — proposal, gate verdict, rationale — anchored on-chain via ERC-8004. You can verify the agent never rewrote its own history. It's a glass box."
          visual={<TransparencyVisual />}
        />
        <Feature
          reverse
          icon={ShieldCheck}
          eyebrow="Risk-gated"
          title="Built to survive."
          body="The model proposes; a deterministic, fail-safe risk gate disposes. It sizes small, caps exposure, and auto-flattens far inside the disqualification line — so a token blow-up becomes a scratch."
          visual={<RiskVisual dd={dd} ceiling={data?.internalCeilingPct ?? 12} cap={data?.competitionCapPct ?? 30} />}
        />
        <Feature
          icon={Layers}
          eyebrow="Trade your way"
          title="Autonomous, DCA, or manual."
          body="Let the AI run the show, schedule recurring DCA buys, or take one-tap manual control. Every path still flows through the same risk gate — and you can pause it any time."
          visual={<ModesVisual />}
        />
      </section>

      {/* ───────────────────────── THE LINE ───────────────────────── */}
      <section className="border-y border-[var(--color-line)] py-28 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(60% 80% at 50% 50%, rgba(78,230,168,0.06), transparent)" }}
        />
        <motion.div {...reveal} className="relative max-w-[900px] mx-auto px-5 text-center">
          <div className="label mb-6 flex items-center justify-center gap-2">
            <Lock size={12} /> self-custody · the model never signs
          </div>
          <p className="display text-[clamp(30px,5.5vw,60px)] leading-[1.05]">
            The model proposes.
            <br />
            <span className="italic" style={{ color: "var(--color-mint)" }}>
              The gate disposes.
            </span>
          </p>
        </motion.div>
      </section>

      {/* ───────────────────────── CLOSING CTA ───────────────────────── */}
      <section className="max-w-[1100px] mx-auto px-5 md:px-8 py-28 text-center">
        <motion.div {...reveal}>
          <h2 className="display text-[clamp(40px,7vw,84px)] leading-[0.95]">
            Watch it{" "}
            <span className="italic glow-mint" style={{ color: "var(--color-mint)" }}>
              think.
            </span>
          </h2>
          <p className="text-[var(--color-muted)] text-[17px] mt-6 max-w-[460px] mx-auto leading-relaxed">
            Open the desk and see the agent perceive, reason, get gated, and trade — live, on real
            market data.
          </p>
          <Link
            href="/desk"
            className="group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold mt-9 transition-transform hover:scale-[1.03] active:scale-95"
            style={{ background: "var(--color-mint)", color: "#08080b", boxShadow: "0 0 50px -8px var(--color-mint)" }}
          >
            Enter the desk
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </section>

      <footer className="border-t border-[var(--color-line)]">
        <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-8 flex items-center justify-between flex-wrap gap-3">
          <span className="display text-[18px]">
            Glass<span className="italic" style={{ color: "var(--color-mint)" }}>Box</span>
          </span>
          <span className="label">transparent · risk-gated · self-custody · BNB HACK Track 1</span>
        </div>
      </footer>
    </main>
  );
}

/* ── bits ─────────────────────────────────────────────────────────────── */
function Stat({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="text-left">
      <div className="label">{k}</div>
      <div className="tnum text-[18px] mt-1" style={c ? { color: c } : undefined}>{v}</div>
    </div>
  );
}
function Dot() {
  return <span className="h-8 w-px bg-[var(--color-line)]" />;
}

function Feature({
  icon: Icon,
  eyebrow,
  title,
  body,
  visual,
  reverse,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  eyebrow: string;
  title: string;
  body: string;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <motion.div {...reveal} className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
      <div className={reverse ? "lg:order-2" : ""}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-[9px] hairline flex items-center justify-center">
            <Icon size={15} className="text-[var(--color-mint)]" />
          </div>
          <span className="label">{eyebrow}</span>
        </div>
        <h3 className="display text-[clamp(30px,4.5vw,46px)] leading-[1.02]">{title}</h3>
        <p className="text-[var(--color-muted)] text-[15px] md:text-[16px] leading-relaxed mt-5 max-w-[460px]">{body}</p>
      </div>
      <div className={reverse ? "lg:order-1" : ""}>{visual}</div>
    </motion.div>
  );
}

function TransparencyVisual() {
  const lines = [
    { a: "HOLD", t: "risk_off regime — stay in stablecoin.", c: "var(--color-faint)" },
    { a: "BUY", t: "BNB momentum + adequate liquidity; sized small.", c: "var(--color-mint)" },
    { a: "SELL", t: "drawdown breach — auto-flatten, pause.", c: "var(--color-danger)" },
  ];
  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="label">decision log</span>
        <span className="label" style={{ color: "var(--color-mint)" }}>anchored ✓</span>
      </div>
      <div className="flex flex-col gap-3">
        {lines.map((l, i) => (
          <div key={i} className="flex items-start gap-3 pb-3 border-b border-[var(--color-line)] last:border-0">
            <span className="tnum text-[11px] mt-0.5 shrink-0 w-9" style={{ color: l.c }}>{l.a}</span>
            <p className="text-[12px] text-[var(--color-muted)] leading-snug flex-1">{l.t}</p>
          </div>
        ))}
      </div>
      <div className="tnum text-[10px] text-[var(--color-faint)] mt-3 truncate">
        0x9f3a…e7c2 → bscscan · hash-chained
      </div>
    </div>
  );
}

function RiskVisual({ dd, ceiling, cap }: { dd: number; ceiling: number; cap: number }) {
  return (
    <div className="glass p-6 flex flex-col items-center">
      <div className="scale-90">
        <DrawdownGauge dd={dd} ceiling={ceiling} cap={cap} />
      </div>
      <div className="grid grid-cols-3 gap-3 w-full mt-2">
        <Mini k="token move" v="−40%" c="var(--color-danger)" />
        <Mini k="→ portfolio" v="−4%" c="var(--color-mint)" />
        <Mini k="vs DQ" v={`${cap}%`} c="var(--color-faint)" />
      </div>
    </div>
  );
}
function Mini({ k, v, c }: { k: string; v: string; c: string }) {
  return (
    <div className="hairline rounded-xl py-3 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="tnum text-[20px]" style={{ color: c }}>{v}</div>
      <div className="label mt-1">{k}</div>
    </div>
  );
}

function ModesVisual() {
  return (
    <div className="glass p-5">
      <div className="flex gap-1.5 mb-5">
        {["Autonomous", "DCA", "Manual"].map((t, i) => (
          <div
            key={t}
            className="flex-1 text-center text-[12px] py-1.5 rounded-lg"
            style={{
              color: i === 0 ? "#08080b" : "var(--color-muted)",
              background: i === 0 ? "var(--color-mint)" : "rgba(255,255,255,0.03)",
              fontWeight: i === 0 ? 600 : 400,
            }}
          >
            {t}
          </div>
        ))}
      </div>
      <div className="panel px-4 py-3 mb-3">
        <div className="label mb-1.5">current intent</div>
        <div className="tnum text-[18px]" style={{ color: "var(--color-mint)" }}>BUY · BNB</div>
        <div className="text-[11.5px] text-[var(--color-muted)] mt-1">momentum + supportive regime; sized small.</div>
      </div>
      <div className="flex items-center justify-between">
        <span className="label">drawdown ceiling</span>
        <span className="tnum text-[13px]" style={{ color: "var(--color-amber)" }}>12%</span>
      </div>
      <div className="h-1.5 rounded-full mt-2" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: "42%", background: "var(--color-amber)" }} />
      </div>
    </div>
  );
}
