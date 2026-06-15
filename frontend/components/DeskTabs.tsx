"use client";
import { useState } from "react";
import { Brain, Receipt, Layers, LineChart } from "lucide-react";
import ReasoningFeed from "./ReasoningFeed";
import TxHistory from "./TxHistory";
import Positions from "./Positions";
import EquityChart from "./EquityChart";
import DrawdownGauge from "./DrawdownGauge";
import type { Portfolio } from "@/lib/types";

type Tab = "reasoning" | "trades" | "positions" | "performance";
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "reasoning", label: "Reasoning", icon: Brain },
  { id: "trades", label: "Trades", icon: Receipt },
  { id: "positions", label: "Positions", icon: Layers },
  { id: "performance", label: "Performance", icon: LineChart },
];

export default function DeskTabs({
  portfolio, prices, wallet, agentId, equitySeries, start, dd, ceiling, cap,
}: {
  portfolio: Portfolio | null;
  prices: Record<string, number>;
  wallet: string | null;
  agentId: string | null;
  equitySeries: { t: number; v: number }[];
  start: number;
  dd: number;
  ceiling: number;
  cap: number;
}) {
  const [tab, setTab] = useState<Tab>("reasoning");

  return (
    <div>
      {/* segmented control */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto no-scrollbar">
        <div className="flex gap-1 rounded-full p-1 hairline shrink-0" style={{ background: "rgba(255,255,255,0.025)" }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] transition-colors"
                style={{
                  color: active ? "#08080b" : "var(--color-muted)",
                  background: active ? "var(--color-mint)" : "transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-[460px]">
        {tab === "reasoning" && <ReasoningFeed />}
        {tab === "trades" && <TxHistory />}
        {tab === "positions" && (
          <Positions portfolio={portfolio} prices={prices} wallet={wallet} agentId={agentId} />
        )}
        {tab === "performance" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
            <div className="lg:col-span-4 glass p-6 flex flex-col items-center justify-center relative overflow-hidden">
              <span className="absolute top-5 left-6 label">survival monitor</span>
              <div className="scale-[0.9] origin-center">
                <DrawdownGauge dd={dd} ceiling={ceiling} cap={cap} />
              </div>
              <p className="text-[12px] text-[var(--color-muted)] text-center mt-3 max-w-[260px] leading-snug">
                Auto-flattens far inside the line. <span className="text-[var(--color-mint)]">Survival is the alpha.</span>
              </p>
            </div>
            <div className="lg:col-span-8 h-full">
              <EquityChart series={equitySeries} start={start} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
