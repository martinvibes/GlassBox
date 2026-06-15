"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import ConnectWallet from "./ConnectWallet";
import PrivyConnect from "./PrivyConnect";

const HAS_PRIVY = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/desk", label: "Desk" },
  { href: "/strategy", label: "Strategy" },
  { href: "/doc", label: "Docs" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <motion.nav
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{
        background: "linear-gradient(180deg, rgba(7,8,10,0.9), rgba(7,8,10,0.45))",
        borderBottom: "1px solid var(--color-line)",
      }}
    >
      <div className="max-w-[1480px] mx-auto px-5 md:px-8 h-14 flex items-center justify-between gap-4">
        {/* left: wordmark */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div
            className="h-7 w-7 rounded-[8px] hairline flex items-center justify-center"
            style={{ background: "linear-gradient(145deg, rgba(78,230,168,0.18), rgba(87,199,255,0.06))" }}
          >
            <div
              className="h-3 w-3 rounded-[3px] border border-[var(--color-mint)]"
              style={{ boxShadow: "0 0 10px var(--color-mint)" }}
            />
          </div>
          <span className="display text-[20px]">
            Glass<span className="italic" style={{ color: "var(--color-mint)" }}>Box</span>
          </span>
        </Link>

        {/* center: pill nav */}
        <div
          className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 rounded-full px-1.5 py-1.5 hairline"
          style={{ background: "rgba(255,255,255,0.025)" }}
        >
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className="relative px-4 py-1.5 text-[13px] rounded-full transition-colors"
                style={{ color: active ? "#07080a" : "var(--color-muted)" }}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "var(--color-mint)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{l.label}</span>
              </Link>
            );
          })}
        </div>

        {/* right: github + connect */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-[13px] text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors hidden sm:block"
          >
            GitHub ↗
          </a>
          {HAS_PRIVY ? <PrivyConnect /> : <ConnectWallet />}
        </div>
      </div>
    </motion.nav>
  );
}
