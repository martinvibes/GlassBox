# GlassBox — Strategy & Submission (BNB HACK Track 1)

> **A transparent, risk-gated autonomous trading agent for BNB Chain.**
> The LLM *proposes*; a deterministic risk gate *disposes*; **the model never signs.**
> Every decision is logged, hash-chained, anchored on-chain, and shown live on a public dashboard.

| | |
|---|---|
| **Track** | 1 — Autonomous Trading Agents |
| **Agent wallet (on-chain proof)** | `0x3D0d14207eb8Ef26b5110786C4b625b67D9083BE` (BSC) |
| **Execution layer** | Trust Wallet Agent Kit (TWAK) — self-custody local signing |
| **Live demo** | https://glassboxx.up.railway.app/ |
| **Repo** | https://github.com/martinvibes/GlassBox |
| **Mode** | Paper by default; one env flag flips to live on the same container |

---

## 1. The thesis: survival is the alpha

Track 1 is a **7-day live-PnL contest with a max-drawdown cap (≈30%) as a hard DQ line**, a
minimum of **1 trade/day**, and simulated transaction costs. Over ~7 days and a handful of
trades, **no one can prove a statistical edge — but anyone can blow up.** The dominant failure
mode is over-leverage: most entrants chase a big number, trip the drawdown gate, and self-DQ
regardless of how good their headline return looked.

GlassBox is built to **win by not losing.** We:

1. **Default to stablecoins** and only deploy capital on genuine, confirmed signals.
2. **Cut losers fast and let winners run** via a trailing stop, so a closed trade almost never
   ends red.
3. **Hard-flatten at an *internal* drawdown ceiling (12%)** — far inside the competition cap —
   then pause and cool off.
4. **Never approach the DQ line.** The risk gate is pure, deterministic, and fail-safe: any
   error blocks the trade rather than risking the book.

The goal is **top risk-adjusted PnL with zero gate breaches** — positive return while every
over-leveraged competitor is busy disqualifying themselves.

---

## 2. How it makes money (when it deploys)

GlassBox trades **spot, long-or-cash** across a diversified book of up to **6 BEP-20 names**
from the competition allowlist. Each heartbeat it makes exactly **one** auditable move. Two
setups — and only two — ever qualify for an entry, both requiring a **7-day uptrend** (we never
catch a falling knife):

- **Momentum continuation** — 1h *and* 24h aligned up: ride the strongest name.
- **Oversold dip-reclaim** — 24h red inside a 7d uptrend, but the **1h is turning back up**:
  buy the reclaim, not the knife. This is where most money is made — pullbacks are constant, and
  sitting in cash through every dip earns nothing.

On top of the per-name signal we apply a **market-breadth filter**: if fewer than 40% of the
tradeable universe is in a 7d uptrend, the whole market is falling, individual "reclaims" are
bull traps, and we **stay in cash**. Entry selectivity also scales with fear — a deeper
Fear & Greed reading raises the quality bar.

Position sizing is deliberately modest: target ~9% equity per name, gross exposure capped by
regime posture (0% in capitulation, up to 45–60% in healthier tape). **Diversify across setups,
never pile into one name.**

---

## 3. How it protects capital (the gate)

`glassbox/risk/gate.py` is the heart of the system — **pure Python, no LLM, no network,
deterministic, fail-safe.** Every proposal passes through it, in priority order:

1. **Drawdown circuit-breaker** — at the 12% internal ceiling it **FLATTENs everything** and
   arms a cool-off pause. (Competition cap is ~30%; we never get close.)
2. **Deterministic exits, checked first, every cycle, on every open position:**
   - **Trailing stop** — once a trade is +1.2% it arms a stop 0.4% behind its running peak, so
     winners keep running on new highs and are only sold once the move rolls over. The locked
     floor clears the ~0.66% round-trip cost, so a "green" exit is genuinely green.
   - **Hard stop** — an un-armed position at −1.5% is cut immediately. Losses stay small.
   - **Take-profit backstop** — a rare vertical spike is banked outright.
3. **Regime posture** — only true capitulation (`risk_off`) stands the agent fully down; every
   other regime deploys, sized by conviction and the gross-exposure cap.
4. **Allowlist, conviction floor, per-trade / per-position / gross caps, slippage guard,
   daily-trade cap, cooldown, cash availability** — the requested size is clamped down through
   every cap, and anything below the minimum trade size is blocked.

The model can only ever *propose*. It cannot widen a cap, skip a stop, or sign a transaction.

---

## 4. Architecture — LLM proposes, gate disposes

```
ORCHESTRATOR (heartbeat)
  → PERCEPTION   CMC Agent Hub + multi-timeframe market data   → Signals
  → REASONING    one auditable LLM call (Claude)               → TradeProposal   [proposes only]
  → RISK GATE    pure, deterministic Python                    → GateDecision    [disposes]
  → EXECUTION    TWAK self-custody local signing               → ExecutionResult
  → AUDIT        append-only, hash-chained JSONL
  → VERIFY       ERC-8004 on-chain decision anchor (fail-soft)
  → DASHBOARD    positions, reasoning log, drawdown gauge, proof links
```

The reasoning layer is intentionally **thin** — a single structured Claude call at genuine
decision points (flat with a fresh opportunity, or holding a name that broke its trend),
falling back to a transparent deterministic heuristic when no API key is present. **No
multi-agent circus**: over a 7-day window that only adds failure surface. The edge is
discipline, not cleverness.

It also **learns within the session**: a persisted memory tracks per-token win/loss and which
names keep stopping us out, and the agent steers around them — a feedback loop a static
indicator bot doesn't have.

---

## 5. Trust Wallet Agent Kit — self-custody is the heart, not plumbing

GlassBox is built for the **Best Use of TWAK** special, against its rubric:

- **TWAK is the sole execution layer.** Quotes and swaps run through `twak swap` on
  `--chain bsc` (quote-then-execute); there is no alternate signing path. The real trade logic
  lives in our gate, but **every byte that touches the chain goes through TWAK.**
- **Self-custody integrity, end to end.** Keys never leave the local TWAK keystore (`~/.twak/`)
  — never in code, env, or logs. The agent signs locally for the entire trade loop. There is no
  third-party co-signer and no custodial step.
- **Autonomous execution inside guardrails.** The agent signs and processes its own
  transactions hands-off, bounded by the rulebook: drawdown caps, token allowlist, per-trade /
  daily limits, and slippage protection — all enforced by the deterministic gate.
- **On-chain identity & proof.** Agent identity and per-decision hashes are anchored via
  `twak erc8004` on BSC mainnet (fail-soft — anchoring never blocks a trade).
- **Registration** is on-chain via `twak compete register` against the competition contract.
- **x402** — the perception layer is structured around an x402 pay-per-call path (config-gated
  via `CMC_X402_ENABLED`); see §6 for its current status.

## 6. CoinMarketCap Agent Hub

The agent's perception is **designed around the CMC AI Agent Hub**: a CMC client with MCP and
x402 transports is built in (`glassbox/perception/cmc.py`, config-gated), intended to merge
CMC's decision-ready regime and per-token analytics on top of the live baseline. Today the
**active live transport** runs on real market data — multi-timeframe momentum (1h / 24h / 7d)
plus the **Fear & Greed** index that drives both regime classification and entry selectivity,
exactly the "sentiment-aware rotation" the brief calls for. Swapping the CMC MCP/x402 endpoint
in as the primary signal source (and paying per-call via x402 as part of the trade loop) is the
top remaining integration for the CMC and TWAK x402 specials.

---

## 7. Staying qualified (without breaking the thesis)

Two competition rules interact dangerously with a survival strategy, and we handle both
explicitly:

- **≥1 trade/day or DQ.** An all-cash week would disqualify us for inactivity. So on any quiet
  day the gate enforces a **zero-risk keep-alive**: a tiny swap between two in-scope
  **stablecoins** (USDT↔USDC). Both are on the eligible-token list, so it counts as a qualifying
  trade — yet the agent **stays fully in stablecoin and takes no market exposure**, even on a
  capitulation day when a volatile probe would (correctly) be blocked. Real opportunity trades
  satisfy the floor on active days, so the keep-alive only fires when nothing better exists.
- **Non-zero in-scope balance at the start, capital deployed for the full window.** We start and
  rest in USDT/USDC — both in-scope — so the book is never scored as dust.

---

## 8. Transparency — the "Glass" in GlassBox

Every cycle appends a record to an **append-only, hash-chained JSONL audit log**: the signals,
the model's verbatim rationale, the gate's decision and reasons, the execution result, equity,
and drawdown. The **public dashboard** tails this live: open positions, the reasoning log, a
drawdown gauge against both the internal ceiling and the competition cap, and links to on-chain
proofs. A judge can watch the agent think, see exactly why the gate allowed or blocked each
move, and verify it on-chain. Nothing is hidden.

---

## 9. Reproducibility

```bash
# Backend (paper loop runs end-to-end with zero keys)
cd backend && pip install -e ".[dev]"
python -m glassbox.orchestrator --mode paper --once     # single cycle
python -m glassbox.orchestrator --mode paper            # heartbeat loop

# Dashboard
cd frontend && npm install && npm run dev

# Or run both together exactly like the live demo:
docker build -t glassbox . && docker run -p 3000:3000 glassbox
```

Live trading is the same container with `GLASSBOX_MODE=live` plus the TWAK wallet secrets — the
same risk gate, drawdown breaker, and trailing stops apply unchanged.

---

## 10. Honest framing

We are not claiming a magic edge in a one-week, few-trade window — that would be statistically
dishonest, and judges will see through it. We are claiming something more defensible and more
valuable: **an agent a self-custody user would actually let run unattended.** It preserves
capital, refuses to blow up, deploys only on real signals, proves every decision on-chain, and
shows its work in the open. In a field where most entries disqualify themselves on drawdown,
**surviving with positive, risk-adjusted PnL is how Track 1 is won.**
