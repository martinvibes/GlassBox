"use client";
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

type Candle = { time: number; open: number; high: number; low: number; close: number };
const SYMBOLS = ["BNB", "BTC", "ETH", "CAKE"];

export default function PriceChart() {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [sym, setSym] = useState("BNB");
  const [last, setLast] = useState<number | null>(null);
  const [chg, setChg] = useState<number | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const chart = createChart(box.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#8b929e",
        fontFamily: "var(--font-mono)",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: "rgba(78,230,168,0.4)", labelBackgroundColor: "#0e1116" },
        horzLine: { color: "rgba(78,230,168,0.4)", labelBackgroundColor: "#0e1116" },
      },
      handleScale: false,
      handleScroll: false,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#4ee6a8",
      downColor: "#ff5d6c",
      borderUpColor: "#4ee6a8",
      borderDownColor: "#ff5d6c",
      wickUpColor: "rgba(78,230,168,0.6)",
      wickDownColor: "rgba(255,93,108,0.6)",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (box.current) chart.applyOptions({ width: box.current.clientWidth, height: box.current.clientHeight });
    });
    ro.observe(box.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/candles?symbol=${sym}&days=1`, { cache: "no-store" });
        const j = await r.json();
        const candles: Candle[] = j.candles ?? [];
        if (!live || !seriesRef.current || candles.length === 0) return;
        seriesRef.current.setData(
          candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })),
        );
        chartRef.current?.timeScale().fitContent();
        const first = candles[0].open;
        const cur = candles[candles.length - 1].close;
        setLast(cur);
        setChg(((cur - first) / first) * 100);
      } catch {
        /* keep last good data */
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [sym]);

  const up = (chg ?? 0) >= 0;

  return (
    <div className="glass p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="label">price · 24h</span>
          <div className="flex gap-1">
            {SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => setSym(s)}
                className="tnum text-[11px] px-2 py-0.5 rounded transition-colors"
                style={{
                  color: s === sym ? "#07080a" : "var(--color-muted)",
                  background: s === sym ? "var(--color-mint)" : "rgba(255,255,255,0.03)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="text-right">
          <div className="tnum text-[18px] leading-none">
            {last == null ? "—" : `$${last.toLocaleString("en-US", { maximumFractionDigits: last < 10 ? 4 : 2 })}`}
          </div>
          <div className="tnum text-[12px] mt-1" style={{ color: up ? "var(--color-mint)" : "var(--color-danger)" }}>
            {chg == null ? "" : `${up ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)}%`}
          </div>
        </div>
      </div>
      <div ref={box} className="flex-1 min-h-[280px]" />
    </div>
  );
}
