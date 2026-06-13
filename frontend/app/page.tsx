"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { usePolling } from "@/lib/usePolling";
import Spotlight from "@/components/Spotlight";
import DrawdownGauge from "@/components/DrawdownGauge";
import { money } from "@/lib/format";
import type { StatePayload } from "@/lib/types";

const PILLARS = [
  {
    t: "Transparent",
    d: "Every decision is a human-readable, hash-chained artifact, anchored on-chain via ERC-8004. Nothing is hidden — it is a glass box.",
    c: "var(--color-cyan)",
  },
  {
    t: "Risk-gated",
    d: "The model proposes; a deterministic, fail-safe gate disposes. It auto-flattens far inside the disqualification line. Survival is the alpha.",
    c: "var(--color-mint)",
  },
  {
    t: "Self-custody",
    d: "Trades settle on BNB Chain through the Trust Wallet Agent Kit. Keys sign locally. The model never touches the wallet.",
    c: "var(--color-violet)",
  },
];

export default function Landing() {
  const { data } = usePolling<StatePayload>("/api/state", 8000);
  const dd = data?.drawdownPct ?? 0;
  const equity = data?.equity ?? 1000;
  const regime = data?.regime ?? "unknown";

  return (
    <main className="relative z-10">
      {/* HERO */}
      <section className="relative min-h-[calc(100vh-3.5rem)] flex items-center overflow-hidden">
        <Spotlight />
        <div className="relative max-w-[1480px] mx-auto px-5 md:px-8 w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center py-16">
          <div className="lg:col-span-7">
            <div
              className="anim anim-fade inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 hairline mb-8"
              style={{ background: "rgba(255,255,255,0.025)", animationDelay: "0.1s" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-mint)] live-dot" />
              <span className="label">BNB HACK · Track 1 · Autonomous Trading Agents</span>
            </div>

            <h1 className="display text-[clamp(48px,8vw,98px)] leading-[0.9] tracking-tight">
              <span className="block anim anim-rise" style={{ animationDelay: "0.2s" }}>
                Survival is
              </span>
              <span className="block anim anim-rise -mt-1" style={{ animationDelay: "0.38s" }}>
                the{" "}
                <span className="italic glow-mint" style={{ color: "var(--color-mint)" }}>
                  alpha.
                </span>
              </span>
            </h1>

            <p
              className="anim anim-fade text-[var(--color-muted)] text-[17px] md:text-[19px] leading-relaxed mt-7 max-w-[540px]"
              style={{ animationDelay: "0.6s" }}
            >
              GlassBox is a transparent, risk-gated autonomous trading agent for BNB Chain.
              It reads the market, reasons in the open, and survives the drawdown gate that
              disqualifies everyone else.
            </p>

            <div
              className="anim anim-fade flex items-center gap-3 mt-9 flex-wrap"
              style={{ animationDelay: "0.75s" }}
            >
              <Link
                href="/desk"
                className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold transition-transform hover:scale-[1.03] active:scale-95"
                style={{ background: "var(--color-mint)", color: "#07080a", boxShadow: "0 0 34px -8px var(--color-mint)" }}
              >
                Enter the desk
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
              <Link
                href="/strategy"
                className="inline-flex items-center rounded-full px-6 py-3 text-[14px] hairline text-[var(--color-fg)] hover:bg-white/[0.04] transition-colors"
              >
                How it works
              </Link>
            </div>

            <div
              className="anim anim-fade flex items-center gap-7 mt-12"
              style={{ animationDelay: "0.9s" }}
            >
              <Stat k="live equity" v={money(equity, 0)} />
              <Divider />
              <Stat k="drawdown" v={`${dd.toFixed(1)}%`} c="var(--color-mint)" />
              <Divider />
              <Stat k="regime" v={regime.replace("_", "-")} />
            </div>
          </div>

          {/* live gauge teaser */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 flex justify-center"
          >
            <div className="glass p-8 w-full max-w-[400px] flex flex-col items-center">
              <div className="label self-start mb-1">live survival monitor</div>
              <DrawdownGauge
                dd={dd}
                ceiling={data?.internalCeilingPct ?? 12}
                cap={data?.competitionCapPct ?? 30}
              />
              <Link
                href="/desk"
                className="text-[12px] text-[var(--color-muted)] hover:text-[var(--color-mint)] mt-4 transition-colors"
              >
                open full desk →
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="max-w-[1480px] mx-auto px-5 md:px-8 pb-24 -mt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.t}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="glass p-7 group hover:border-[var(--color-line-bright)] transition-colors"
            >
              <div className="h-9 w-9 rounded-[10px] hairline flex items-center justify-center mb-5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: p.c, boxShadow: `0 0 14px ${p.c}` }} />
              </div>
              <h3 className="display text-[27px] mb-2.5">{p.t}</h3>
              <p className="text-[var(--color-muted)] text-[14px] leading-relaxed">{p.d}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mt-24"
        >
          <p className="display text-[clamp(28px,4.5vw,50px)] leading-tight max-w-[820px] mx-auto">
            The model proposes.{" "}
            <span className="italic" style={{ color: "var(--color-mint)" }}>
              The gate disposes.
            </span>
          </p>
          <p className="text-[var(--color-faint)] text-[14px] mt-5 max-w-[560px] mx-auto leading-relaxed">
            Most agents over-leverage and trip the drawdown cap. GlassBox is built to be the one
            still standing — with its reasoning fully on display.
          </p>
        </motion.div>
      </section>
    </main>
  );
}

function Stat({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div>
      <div className="label">{k}</div>
      <div className="tnum text-[20px] mt-1.5" style={c ? { color: c } : undefined}>
        {v}
      </div>
    </div>
  );
}
function Divider() {
  return <div className="h-9 w-px bg-[var(--color-line)]" />;
}
