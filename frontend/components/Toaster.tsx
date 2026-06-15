"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Info } from "lucide-react";
import { subscribeToasts, type ToastItem, type ToastKind } from "@/lib/toast";

const META: Record<ToastKind, { color: string; bg: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  success: { color: "var(--color-mint)", bg: "rgba(78,230,168,0.12)", Icon: CheckCircle2 },
  error: { color: "var(--color-danger)", bg: "rgba(255,93,108,0.12)", Icon: XCircle },
  loading: { color: "var(--color-amber)", bg: "rgba(255,180,77,0.12)", Icon: Loader2 },
  info: { color: "var(--color-cyan)", bg: "rgba(87,199,255,0.12)", Icon: Info },
};

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => subscribeToasts(setItems), []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed top-20 right-5 z-[200] flex flex-col gap-2.5 pointer-events-none">
      <AnimatePresence>
        {items.map((t) => {
          const m = META[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              className="glass pointer-events-auto flex items-center gap-3 pl-3.5 pr-5 py-3 min-w-[260px] max-w-[360px]"
              style={{ borderColor: m.color, boxShadow: `0 0 30px -14px ${m.color}` }}
            >
              <span style={{ color: m.color }} className="shrink-0">
                <m.Icon size={17} className={t.kind === "loading" ? "animate-spin" : ""} />
              </span>
              <span className="text-[13px] leading-snug" style={{ color: "var(--color-fg)" }}>{t.msg}</span>
              <span className="ml-auto h-1.5 w-1.5 rounded-full shrink-0" style={{ background: m.color }} />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
}
