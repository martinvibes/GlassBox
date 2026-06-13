"use client";
import { useEffect, useRef } from "react";

/**
 * Cursor-following spotlight. A dim grid is the base; a bright mint/cyan grid
 * is revealed only inside a soft circular mask that trails the cursor (eased via
 * requestAnimationFrame), plus a faint mint glow. Pure CSS mask — no canvas.
 */
export default function Spotlight({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -999, y: -999 });
  const smooth = useRef({ x: -999, y: -999 });
  const raf = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const loop = () => {
      smooth.current.x += (mouse.current.x - smooth.current.x) * 0.12;
      smooth.current.y += (mouse.current.y - smooth.current.y) * 0.12;
      el.style.setProperty("--mx", `${smooth.current.x}px`);
      el.style.setProperty("--my", `${smooth.current.y}px`);
      raf.current = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", onMove);
    raf.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div ref={ref} className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <div className="absolute inset-0 spotlight-base" style={{ maskImage: "radial-gradient(120% 110% at 50% 0%, #000 35%, transparent 85%)" }} />
      <div className="absolute inset-0 spotlight-reveal" />
      <div className="absolute inset-0 spotlight-glow" />
    </div>
  );
}
