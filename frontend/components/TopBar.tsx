"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RegimePill } from "./ui";
import DepositButton from "./DepositButton";
import type { Regime } from "@/lib/types";

export default function TopBar({
  regime,
  mode,
  wallet,
  cycles,
}: {
  regime: Regime;
  mode: string;
  wallet: string | null;
  cycles: number;
}) {
  const [clock, setClock] = useState("--:--:--");
  useEffect(() => {
    const t = () => setClock(new Date().toISOString().slice(11, 19));
    t();
    const id = setInterval(t, 1000);
    return () => clearInterval(id);
  }, []);

  const live = mode === "live";

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="flex items-end justify-between gap-4 flex-wrap"
    >
      <div>
        <h1 className="text-[27px] font-semibold tracking-[-0.02em] leading-none">Live Desk</h1>
        <p className="text-[13px] text-[var(--color-muted)] mt-2">
          Autonomous trading · BNB Chain · self-custody
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <RegimePill regime={regime} />
        <Chip
          label="Mode"
          value={mode.toUpperCase()}
          accent={live ? "var(--color-mint)" : "var(--color-cyan)"}
          dot={live ? "var(--color-mint)" : undefined}
        />
        <Chip label="Cycles" value={String(cycles)} />
        <div
          className="hidden xl:inline-flex items-center gap-2 rounded-full px-3.5 py-2 hairline"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-mint)] live-dot" />
          <span className="tnum text-[12.5px] text-[var(--color-muted)]">{clock} UTC</span>
        </div>
        <DepositButton />
      </div>
    </motion.header>
  );
}

function Chip({
  label,
  value,
  accent,
  mono,
  dot,
}: {
  label: string;
  value: string;
  accent?: string;
  mono?: boolean;
  dot?: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 hairline"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-faint)]">{label}</span>
      <span className={`text-[12.5px] ${mono ? "tnum" : "font-medium"}`} style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}
