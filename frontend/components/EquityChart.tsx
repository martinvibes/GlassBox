"use client";
import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

export default function EquityChart({
  series,
  start,
}: {
  series: { t: number; v: number }[];
  start: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaRef = useRef<ISeriesApi<"Area"> | null>(null);

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
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      crosshair: { horzLine: { labelBackgroundColor: "#0e1116" }, vertLine: { labelBackgroundColor: "#0e1116" } },
      handleScale: false,
      handleScroll: false,
    });
    const area = chart.addSeries(AreaSeries, {
      lineColor: "#4ee6a8",
      topColor: "rgba(78,230,168,0.28)",
      bottomColor: "rgba(78,230,168,0.0)",
      lineWidth: 2,
      priceLineVisible: false,
    });
    chartRef.current = chart;
    areaRef.current = area;

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
    if (!areaRef.current) return;
    const data =
      series.length > 0
        ? series.map((p) => ({ time: p.t as UTCTimestamp, value: p.v }))
        : [];
    areaRef.current.setData(data);
    // baseline marker at starting equity
    areaRef.current.createPriceLine({
      price: start,
      color: "rgba(255,255,255,0.18)",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "start",
    });
    chartRef.current?.timeScale().fitContent();
  }, [series, start]);

  return (
    <div className="glass p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <span className="label">equity curve · paper</span>
        <span className="label">usd</span>
      </div>
      <div ref={box} className="flex-1 min-h-[200px]" />
      {series.length === 0 && (
        <div className="text-[11px] text-[var(--color-faint)] mt-2 tnum">
          no cycles yet — run the agent to populate the curve
        </div>
      )}
    </div>
  );
}
