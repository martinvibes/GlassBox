"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield, Activity, Gauge, Wallet, Eye, Layers, ArrowRight,
  TrendingUp, Lock, Boxes, BookOpen, Cpu, ScrollText,
} from "lucide-react";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "thesis", label: "The thesis", icon: Shield },
  { id: "loop", label: "Decision loop", icon: Cpu },
  { id: "gate", label: "The risk gate", icon: Gauge },
  { id: "exits", label: "Exits & sizing", icon: TrendingUp },
  { id: "modes", label: "Operating modes", icon: Activity },
  { id: "wallet", label: "Wallet & custody", icon: Wallet },
  { id: "transparency", label: "Transparency", icon: Eye },
  { id: "stacks", label: "Sponsor stacks", icon: Layers },
  { id: "faq", label: "FAQ", icon: ScrollText },
];

export default function DocPage() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="relative min-h-screen">
      {/* hero */}
      <div className="max-w-[1480px] mx-auto px-5 md:px-8 pt-14 pb-8">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="label mb-3">documentation · v1</div>
          <h1 className="display text-[44px] md:text-[60px] leading-[1.02]">
            How <span className="italic" style={{ color: "var(--color-mint)" }}>GlassBox</span> trades —
            <br className="hidden md:block" /> and why it survives.
          </h1>
          <p className="text-[15px] md:text-[16px] text-[var(--color-muted)] max-w-[640px] leading-relaxed mt-5">
            A transparent, risk-gated autonomous trading agent for BNB Chain. The model proposes;
            a deterministic gate disposes. Every decision is logged, hashed, and anchored on-chain.
            This is the full operator manual.
          </p>
        </motion.div>
      </div>

      <div className="max-w-[1480px] mx-auto px-5 md:px-8 pb-24">
        <div className="grid md:grid-cols-[230px_1fr] gap-8 md:gap-12">
          {/* ── sidebar ── */}
          <aside className="hidden md:block">
            <div className="sticky top-20 flex flex-col gap-1">
              <div className="label mb-2 px-3">on this page</div>
              {SECTIONS.map((s) => {
                const on = active === s.id;
                const Icon = s.icon;
                return (
                  <button key={s.id} onClick={() => go(s.id)}
                    className="relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-left transition-colors"
                    style={{ color: on ? "var(--color-fg)" : "var(--color-faint)" }}>
                    {on && (
                      <motion.span layoutId="doc-active" className="absolute inset-0 rounded-lg hairline"
                        style={{ background: "rgba(78,230,168,0.06)", borderColor: "rgba(78,230,168,0.25)" }}
                        transition={{ type: "spring", stiffness: 400, damping: 34 }} />
                    )}
                    <Icon size={14} className="relative z-10 shrink-0"
                      style={{ color: on ? "var(--color-mint)" : "var(--color-faint)" }} />
                    <span className="relative z-10">{s.label}</span>
                  </button>
                );
              })}
              <Link href="/desk"
                className="mt-4 mx-3 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-semibold transition-transform hover:scale-[1.02]"
                style={{ background: "var(--color-mint)", color: "#08080b" }}>
                Open the desk <ArrowRight size={13} />
              </Link>
            </div>
          </aside>

          {/* ── content ── */}
          <div className="flex flex-col gap-16 min-w-0">
            <Section id="overview" kicker="overview" title="A trading agent you can audit">
              <P>
                GlassBox is an autonomous trading agent built for <Em>BNB HACK: AI Trading Agent Edition,
                Track 1</Em>. It perceives the market, reasons about a single trade, runs that idea through a
                deterministic risk gate, and executes on-chain with self-custody — logging every step.
              </P>
              <P>
                The competition scores real PnL over a seven-day live window with a hard max-drawdown cap.
                Most entrants over-leverage and trip that cap. GlassBox is engineered around a different bet:
                <Em> survive first, compound small edges, and never blow up.</Em>
              </P>
              <div className="grid sm:grid-cols-3 gap-3 mt-2">
                <Stat k="internal DD ceiling" v="12%" sub="auto-flatten trigger" accent="var(--color-amber)" />
                <Stat k="take-profit" v="+1.5%" sub="bank small wins" accent="var(--color-mint)" />
                <Stat k="min trade" v="$1" sub="retail-grade floor" accent="var(--color-cyan)" />
              </div>
            </Section>

            <Section id="thesis" kicker="the thesis" title="Survival is the alpha">
              <P>
                Over roughly seven days and a small number of trades, clever alpha can&apos;t be proven
                statistically — but <Em>blowups can.</Em> So the edge isn&apos;t prediction, it&apos;s discipline:
              </P>
              <List items={[
                ["Rest in stablecoins by default.", "Cash can't draw down. FLAT is the resting posture."],
                ["Deploy only on conviction.", "Multi-signal agreement — momentum, regime, liquidity — before any risk goes on."],
                ["Take small profits, fast.", "A green trade is a closed trade. Many small wins beat one moonshot bet."],
                ["Hard-flatten well inside the cap.", "An internal 12% ceiling trips long before the competition's DQ line."],
              ]} />
              <Callout accent="var(--color-mint)" icon={Shield} title="Core principle">
                The LLM <Em>proposes</Em>. The deterministic risk gate <Em>disposes</Em>. The model never signs a
                transaction — it can only ever suggest one, and the gate has absolute veto.
              </Callout>
            </Section>

            <Section id="loop" kicker="architecture" title="One auditable heartbeat">
              <P>
                Each cycle is a clean pipeline. Every arrow produces a typed, serializable artifact that lands
                in the audit log — so the whole decision is reconstructable after the fact.
              </P>
              <div className="panel p-4 md:p-6 my-1">
                <div className="flex flex-col gap-2.5">
                  <Step n="1" color="var(--color-cyan)" name="Perceive" detail="CMC Agent Hub + live feeds → normalized Signals (regime, prices, momentum, fear/greed)." />
                  <Step n="2" color="var(--color-violet)" name="Reason" detail="One auditable LLM (or heuristic) call → a single TradeProposal. Proposes only." />
                  <Step n="3" color="var(--color-mint)" name="Gate" detail="Pure, deterministic Python → a binding GateDecision. The only authority over execution." />
                  <Step n="4" color="var(--color-amber)" name="Execute" detail="TWAK self-custody swap on BSC (or a paper fill against real prices)." />
                  <Step n="5" color="var(--color-faint)" name="Audit + anchor" detail="Append to a hash-chained JSONL log; anchor the decision hash on-chain (fail-soft)." last />
                </div>
              </div>
              <Callout accent="var(--color-cyan)" icon={Lock} title="Fail-safe by construction">
                The gate is pure: no network, no LLM, no file reads. Same inputs → same decision, always. Any
                unexpected error inside it resolves to <Em>BLOCK</Em> — it can never fail open into a trade.
              </Callout>
            </Section>

            <Section id="gate" kicker="the heart" title="The deterministic risk gate">
              <P>
                Nothing reaches the wallet without clearing the gate. It evaluates every proposal against a
                fixed rulebook and either allows it, clamps its size down, blocks it, or — in an emergency —
                flattens everything. These are the live guardrails:
              </P>
              <div className="overflow-hidden rounded-xl hairline">
                <RuleRow k="Drawdown circuit-breaker" v="≥ 12% → FLATTEN + pause" note="highest priority; closes all positions" first />
                <RuleRow k="Regime posture" v="risk_off ⇒ no new exposure" note="default posture is the safest" />
                <RuleRow k="Conviction floor" v="≥ 0.62 to open" note="0.72 to add to a position" />
                <RuleRow k="Max position size" v="≤ 25% equity / token" note="single-name concentration cap" />
                <RuleRow k="Max gross exposure" v="≤ 60% equity" note="clamped further by regime" />
                <RuleRow k="Slippage guard" v="≤ 80 bps" note="reject if quote exceeds" />
                <RuleRow k="Trade cadence" v="≤ 6 / day · 30m cooldown" note="churn & fee guard (AI trades)" />
                <RuleRow k="Trade size band" v="$1 → 15% equity" note="min floor / max single trade" last />
              </div>
              <P className="text-[13px]">
                Directed actions (your manual trades, DCA, convert) skip the <Em>AI-only</Em> gates — conviction,
                regime posture, cooldown — but every hard safety rule (drawdown breaker, sizing caps, allowlist,
                slippage, daily cap, available balance) still applies. You can&apos;t override survival.
              </P>
            </Section>

            <Section id="exits" kicker="discipline" title="Exits & position sizing">
              <P>
                The agent is built to <Em>take profit early and cut losers fast.</Em> On every cycle, before it
                even considers a new trade, it scans open positions and closes any that breach a threshold —
                deterministically, regardless of what the model wants.
              </P>
              <div className="grid sm:grid-cols-2 gap-3">
                <Callout accent="var(--color-mint)" icon={TrendingUp} title="Take-profit · +1.5%" compact>
                  A position up 1.5% is closed back to stablecoin. Banking the win removes the risk — you can&apos;t
                  give back a gain you&apos;ve already realized.
                </Callout>
                <Callout accent="var(--color-danger)" icon={Gauge} title="Stop-loss · −3%" compact>
                  A position down 3% is cut immediately — far inside the 12% drawdown ceiling, so a single bad
                  trade never threatens the whole run.
                </Callout>
              </div>
              <P>
                Sizing is always a <Em>down-clamp</Em>: the proposal&apos;s requested size is reduced through every
                cap in turn (max-trade → max-position → gross/regime → available cash) and rejected if what
                survives is below the $1 floor. The gate never sizes <Em>up</Em>.
              </P>
            </Section>

            <Section id="modes" kicker="control" title="Three ways to drive it">
              <div className="flex flex-col gap-3">
                <ModeCard icon={Cpu} name="Autonomous" tone="var(--color-mint)"
                  body="Competition mode. The agent opens positions on conviction and takes profit / cuts risk back to cash on its own. You set the guardrails via the live risk mandate; it does the rest." />
                <ModeCard icon={Activity} name="DCA" tone="var(--color-cyan)"
                  body="Dollar-cost-average a chosen token on a fixed interval (1h–24h). Each scheduled buy is still routed through the gate, so caps and the drawdown breaker always apply." />
                <ModeCard icon={Wallet} name="Manual" tone="var(--color-violet)"
                  body="Trade by hand: Buy opens a position, Sell closes it. Plus a wallet-level Convert to move any token into any other (e.g. USDC → USDT) by amount. Everything is gated; fills land in seconds." />
              </div>
            </Section>

            <Section id="wallet" kicker="custody" title="Self-custody on BNB Chain">
              <P>
                The agent holds its own wallet on BSC. Keys live in the TWAK keystore and the local OS keychain —
                <Em> never in code, env files committed to git, or logs.</Em> The private key never touches the
                Python process; TWAK signs locally.
              </P>
              <List items={[
                ["Fund on BNB Smart Chain only.", "Send USDT / USDC (BEP-20), plus a little BNB for gas."],
                ["USDT is the base currency.", "PnL is measured in it, and it's the default resting asset."],
                ["Convert by amount.", "In the wallet panel, enter how much of a token to convert — not a percentage."],
              ]} />
              <Callout accent="var(--color-amber)" icon={Lock} title="Live-fire warning">
                In <Em>live</Em> mode, TWAK broadcasts real on-chain transactions. Use dry-run to rehearse with real
                quotes and zero broadcasts. The executor shows a loud banner before any live run.
              </Callout>
            </Section>

            <Section id="transparency" kicker="proof" title="Every decision, on the record">
              <P>
                Transparency is the product. The dashboard you&apos;re using is read-only — it tails the same audit
                log the agent writes. Nothing is hidden behind the demo.
              </P>
              <List items={[
                ["Append-only JSONL log.", "One record per cycle: signals, proposal, gate decision, execution, equity, drawdown."],
                ["Hash-chained.", "Each record carries the previous record's hash — tamper-evident, like a tiny ledger."],
                ["ERC-8004 anchored.", "The agent has an on-chain identity; decision hashes are anchored on BSC (fail-soft, never blocks a trade)."],
              ]} />
              <Callout accent="var(--color-violet)" icon={Boxes} title="Reproducible">
                Because the gate is deterministic and every input is logged, any decision can be replayed and
                independently verified. The reasoning feed shows the rationale verbatim — including the gate&apos;s.
              </Callout>
            </Section>

            <Section id="stacks" kicker="integrations" title="Built on the sponsor stacks">
              <div className="grid sm:grid-cols-3 gap-3">
                <StackCard name="TWAK" sub="Trust Wallet Agent Kit" body="Mandatory execution path — local self-custody signing and on-chain swaps on native BNB venues." />
                <StackCard name="CMC Agent Hub" sub="CoinMarketCap" body="Market perception: regime, momentum and liquidity signals feeding the reasoning step." />
                <StackCard name="BNB / ERC-8004" sub="identity & anchoring" body="On-chain agent identity and tamper-evident decision anchoring for verifiable transparency." />
              </div>
            </Section>

            <Section id="faq" kicker="questions" title="FAQ">
              <Faq q="Does the AI move my money directly?"
                a="No. The model only emits a proposal. A separate, pure-Python gate decides what (if anything) executes, and TWAK signs locally. The model never holds keys or signs." />
              <Faq q="What's the smallest trade?"
                a="$1. The gate rejects anything that clamps below that floor — small enough to test or scale into, above the level where fees dominate." />
              <Faq q="Why take profit so early?"
                a="Over a few-trade window, realized small gains compound and can't be given back, while holding for a moonshot mostly adds drawdown risk. Banking wins is the survival play." />
              <Faq q="Do I need an Anthropic API key?"
                a="No. A transparent deterministic heuristic runs the full loop with zero keys. An API key only upgrades the quality of the reasoning step's argument — the gate is identical either way." />
              <Faq q="What happens at the drawdown ceiling?"
                a="At 12% drawdown from the high-water mark, the gate flattens every position to stablecoin and pauses new entries for a cool-off window — long before the competition's DQ cap." last />
            </Section>

            <div className="hairline rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              style={{ background: "radial-gradient(120% 120% at 0% 0%, rgba(78,230,168,0.05), transparent 50%)" }}>
              <div>
                <div className="display text-[22px]">Ready to watch it work?</div>
                <p className="text-[13px] text-[var(--color-muted)] mt-1">The desk streams live positions, reasoning, and the drawdown gauge.</p>
              </div>
              <Link href="/desk"
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold transition-transform hover:scale-[1.02] shrink-0"
                style={{ background: "var(--color-mint)", color: "#08080b" }}>
                Open the desk <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ── building blocks ─────────────────────────────────────────────────────── */
function Section({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="label mb-2">{kicker}</div>
      <h2 className="display text-[28px] md:text-[34px] leading-tight mb-4">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function P({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[14.5px] text-[var(--color-muted)] leading-relaxed ${className}`}>{children}</p>;
}
function Em({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--color-fg)] font-medium">{children}</span>;
}

function List({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map(([h, d], i) => (
        <div key={i} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--color-mint)" }} />
          <p className="text-[14px] text-[var(--color-muted)] leading-relaxed">
            <span className="text-[var(--color-fg)] font-medium">{h}</span> {d}
          </p>
        </div>
      ))}
    </div>
  );
}

function Callout({ accent, icon: Icon, title, children, compact }: {
  accent: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; title: string; children: React.ReactNode; compact?: boolean;
}) {
  return (
    <div className="relative rounded-xl hairline overflow-hidden" style={{ background: "rgba(255,255,255,0.015)" }}>
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
      <div className={compact ? "p-4" : "p-5"}>
        <div className="flex items-center gap-2 mb-1.5">
          <Icon size={15} style={{ color: accent }} />
          <span className="text-[13px] font-semibold" style={{ color: accent }}>{title}</span>
        </div>
        <p className="text-[13.5px] text-[var(--color-muted)] leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function Stat({ k, v, sub, accent }: { k: string; v: string; sub: string; accent: string }) {
  return (
    <div className="panel px-4 py-3.5">
      <div className="label">{k}</div>
      <div className="display text-[26px] leading-none mt-1.5" style={{ color: accent }}>{v}</div>
      <div className="text-[11px] text-[var(--color-faint)] mt-1">{sub}</div>
    </div>
  );
}

function Step({ n, color, name, detail, last }: { n: string; color: string; name: string; detail: string; last?: boolean }) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="flex flex-col items-center shrink-0">
        <div className="h-7 w-7 rounded-lg hairline flex items-center justify-center tnum text-[12px]"
          style={{ color, background: "rgba(255,255,255,0.02)" }}>{n}</div>
        {!last && <div className="w-px flex-1 min-h-[14px] mt-1" style={{ background: "var(--color-line)" }} />}
      </div>
      <div className="pb-1">
        <div className="text-[14px] font-medium" style={{ color }}>{name}</div>
        <div className="text-[13px] text-[var(--color-muted)] leading-snug mt-0.5">{detail}</div>
      </div>
    </div>
  );
}

function RuleRow({ k, v, note, first }: { k: string; v: string; note: string; first?: boolean; last?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3"
      style={{ background: "rgba(255,255,255,0.012)", borderTop: first ? "none" : "1px solid var(--color-line)" }}>
      <div className="min-w-0">
        <div className="text-[13.5px] text-[var(--color-fg)]">{k}</div>
        <div className="text-[11.5px] text-[var(--color-faint)] mt-0.5">{note}</div>
      </div>
      <div className="tnum text-[13px] text-right shrink-0" style={{ color: "var(--color-mint)" }}>{v}</div>
    </div>
  );
}

function ModeCard({ icon: Icon, name, tone, body }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; name: string; tone: string; body: string }) {
  return (
    <div className="panel p-4 flex gap-3.5">
      <div className="h-9 w-9 rounded-lg hairline flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.02)" }}>
        <Icon size={16} style={{ color: tone }} />
      </div>
      <div>
        <div className="text-[14.5px] font-medium" style={{ color: tone }}>{name}</div>
        <p className="text-[13px] text-[var(--color-muted)] leading-relaxed mt-1">{body}</p>
      </div>
    </div>
  );
}

function StackCard({ name, sub, body }: { name: string; sub: string; body: string }) {
  return (
    <div className="panel p-4 h-full">
      <div className="text-[15px] font-semibold">{name}</div>
      <div className="label mt-0.5">{sub}</div>
      <p className="text-[12.5px] text-[var(--color-muted)] leading-relaxed mt-2.5">{body}</p>
    </div>
  );
}

function Faq({ q, a, last }: { q: string; a: string; last?: boolean }) {
  return (
    <div className="py-3.5" style={{ borderBottom: last ? "none" : "1px solid var(--color-line)" }}>
      <div className="text-[14.5px] text-[var(--color-fg)] mb-1.5">{q}</div>
      <p className="text-[13.5px] text-[var(--color-muted)] leading-relaxed">{a}</p>
    </div>
  );
}
