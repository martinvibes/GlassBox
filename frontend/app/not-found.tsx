"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Spotlight from "@/components/Spotlight";

export default function NotFound() {
  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] flex items-center justify-center overflow-hidden px-5">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          maskImage: "radial-gradient(110% 80% at 50% 40%, #000 35%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(110% 80% at 50% 40%, #000 35%, transparent 80%)",
        }}
      >
        <Spotlight />
      </div>

      <div className="relative text-center max-w-[640px]">
        <div
          className="anim anim-fade inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 hairline mb-8"
          style={{ background: "rgba(255,255,255,0.025)", animationDelay: "0.05s" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-danger)", boxShadow: "0 0 10px var(--color-danger)" }} />
          <span className="label">error 404 · off the book</span>
        </div>

        <h1 className="display text-[clamp(64px,13vw,140px)] leading-[0.85] tracking-tight">
          <span className="block anim anim-rise" style={{ animationDelay: "0.15s" }}>
            This page got
          </span>
          <span className="block anim anim-rise -mt-1" style={{ animationDelay: "0.3s" }}>
            <span className="italic glow-mint" style={{ color: "var(--color-mint)" }}>
              flattened.
            </span>
          </span>
        </h1>

        <p
          className="anim anim-fade text-[var(--color-muted)] text-[16px] md:text-[18px] leading-relaxed mt-7 max-w-[440px] mx-auto"
          style={{ animationDelay: "0.5s" }}
        >
          The route you&apos;re after isn&apos;t on the order book — the gate disposed of it.
          Let&apos;s get you back to safety.
        </p>

        <div
          className="anim anim-fade flex items-center justify-center gap-3 mt-9 flex-wrap"
          style={{ animationDelay: "0.65s" }}
        >
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold transition-transform hover:scale-[1.03] active:scale-95"
            style={{ background: "var(--color-mint)", color: "#08080b", boxShadow: "0 0 40px -8px var(--color-mint)" }}
          >
            Back to overview
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/desk"
            className="inline-flex items-center rounded-full px-6 py-3 text-[14px] hairline text-[var(--color-fg)] hover:bg-white/[0.04] transition-colors"
          >
            Open the desk
          </Link>
        </div>

        <div className="anim anim-fade label mt-14" style={{ animationDelay: "0.8s" }}>
          GlassBox · the model proposes, the gate disposes
        </div>
      </div>
    </main>
  );
}
