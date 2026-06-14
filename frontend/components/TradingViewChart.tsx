"use client";
import { useEffect, useRef, useState } from "react";

// Real TradingView Advanced Chart — full history, pro drawing tools (labeled on
// hover), every indicator + timeframe. Data is TradingView's (Binance feed), so
// it shows deep historical candles, not a short window.
const SYMBOLS: Record<string, string> = {
  BNB: "BINANCE:BNBUSDT",
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  CAKE: "BINANCE:CAKEUSDT",
};

export default function TradingViewChart() {
  const host = useRef<HTMLDivElement>(null);
  const [sym, setSym] = useState("BNB");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = "";

    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.height = "100%";
    container.style.width = "100%";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: SYMBOLS[sym],
      interval: "240",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      hide_side_toolbar: false, // ← the drawing toolbar (trendline, fib, etc.) with labels
      hide_top_toolbar: false,
      allow_symbol_change: false,
      withdateranges: true,
      details: false,
      calendar: false,
      backgroundColor: "rgba(12, 12, 16, 0)",
      gridColor: "rgba(255, 255, 255, 0.04)",
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);
    el.appendChild(container);

    return () => {
      el.innerHTML = "";
    };
  }, [sym]);

  return (
    <div className="glass p-0 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2.5">
          <span className="label">price · tradingview</span>
          <div className="flex gap-1">
            {Object.keys(SYMBOLS).map((s) => (
              <button
                key={s}
                onClick={() => setSym(s)}
                className="tnum text-[11px] px-2.5 py-1 rounded-md transition-colors"
                style={{
                  color: s === sym ? "#08080b" : "var(--color-muted)",
                  background: s === sym ? "var(--color-mint)" : "rgba(255,255,255,0.03)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <span className="label">drag to draw · scroll for history</span>
      </div>
      <div ref={host} className="flex-1 min-h-[440px]" />
    </div>
  );
}
