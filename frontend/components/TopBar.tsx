"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RegimePill } from "./ui";
import { short } from "@/lib/format";
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
    const t = () => setClock(new Date().toISOString().slice(11, 19) + "Z");
    t();
    const id = setInterval(t, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="flex items-center justify-between gap-4 flex-wrap"
    >
      <div>
        <h1 className="display text-[28px] leading-none">Live Desk</h1>
        <div className="label mt-1.5">autonomous trading · bnb chain · self-custody</div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <RegimePill regime={regime} />
        <Meta k="mode" v={mode.toUpperCase()} accent={mode === "live" ? "var(--color-mint)" : "var(--color-cyan)"} />
        <Meta k="cycles" v={String(cycles)} />
        <Meta k="wallet" v={short(wallet)} />
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5 hairline" style={{ background: "rgba(255,255,255,0.02)" }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-mint)] live-dot" />
          <span className="tnum text-[12px] text-[var(--color-muted)]">{clock}</span>
        </div>
      </div>
    </motion.header>
  );
}

function Meta({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="hidden md:flex flex-col items-end leading-tight">
      <span className="label">{k}</span>
      <span className="tnum text-[12px]" style={accent ? { color: accent } : undefined}>
        {v}
      </span>
    </div>
  );
}
