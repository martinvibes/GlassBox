"use client";
import { motion } from "framer-motion";

function pt(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const s = pt(cx, cy, r, a0);
  const e = pt(cx, cy, r, a1);
  const large = a1 - a0 <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

const SWEEP = 270;
const START = -135;
const END = 135;

export default function DrawdownGauge({
  dd,
  ceiling,
  cap,
}: {
  dd: number;
  ceiling: number;
  cap: number;
}) {
  const S = 260;
  const cx = S / 2;
  const cy = S / 2;
  const r = 104;

  const ang = (v: number) => START + Math.min(Math.max(v / cap, 0), 1) * SWEEP;
  const ceilingA = ang(ceiling);
  const valueA = ang(dd);

  const breached = dd >= ceiling;
  const valueColor = breached ? "var(--color-danger)" : "var(--color-mint)";

  return (
    <div className="relative flex items-center justify-center">
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="overflow-visible">
        <defs>
          <filter id="gaugeGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="dangerGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-amber)" />
            <stop offset="100%" stopColor="var(--color-danger)" />
          </linearGradient>
        </defs>

        {/* track */}
        <path
          d={arc(cx, cy, r, START, END)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* safe zone (0 → internal ceiling) */}
        <path
          d={arc(cx, cy, r, START, ceilingA)}
          fill="none"
          stroke="var(--color-mint-dim)"
          strokeOpacity={0.55}
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* danger zone (ceiling → cap / DQ) */}
        <path
          d={arc(cx, cy, r, ceilingA, END)}
          fill="none"
          stroke="url(#dangerGrad)"
          strokeOpacity={0.4}
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* live value arc */}
        <motion.path
          d={arc(cx, cy, r, START, Math.max(valueA, START + 0.01))}
          fill="none"
          stroke={valueColor}
          strokeWidth={14}
          strokeLinecap="round"
          filter="url(#gaugeGlow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />

        {/* ceiling tick (FLATTEN) */}
        <Tick cx={cx} cy={cy} r={r} a={ceilingA} color="var(--color-amber)" />
        {/* cap tick (DQ) */}
        <Tick cx={cx} cy={cy} r={r} a={END} color="var(--color-danger)" />

        {/* value indicator dot */}
        {(() => {
          const p = pt(cx, cy, r, valueA);
          return (
            <motion.circle
              cx={p.x}
              cy={p.y}
              r={7}
              fill={valueColor}
              filter="url(#gaugeGlow)"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1, type: "spring", stiffness: 200 }}
            />
          );
        })()}
      </svg>

      {/* center readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="label mb-1">Drawdown</div>
        <div
          className={`display text-[58px] leading-none ${breached ? "glow-danger" : "glow-mint"}`}
          style={{ color: valueColor }}
        >
          {dd.toFixed(1)}
          <span className="text-[24px] align-top opacity-60">%</span>
        </div>
        <div className="mt-2 flex items-center gap-3 tnum text-[11px]">
          <span style={{ color: "var(--color-amber)" }}>flatten {ceiling}%</span>
          <span className="opacity-30">·</span>
          <span style={{ color: "var(--color-danger)" }}>DQ {cap}%</span>
        </div>
      </div>
    </div>
  );
}

function Tick({
  cx,
  cy,
  r,
  a,
  color,
}: {
  cx: number;
  cy: number;
  r: number;
  a: number;
  color: string;
}) {
  const o = pt(cx, cy, r + 11, a);
  const i = pt(cx, cy, r - 11, a);
  return <line x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />;
}
