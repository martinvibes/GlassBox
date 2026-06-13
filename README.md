# GlassBox

**A transparent, risk-gated autonomous trading agent for BNB Chain.**

Built for **BNB HACK: AI Trading Agent Edition — Track 1: Autonomous Trading Agents**
($24,000 / 5 winners). Live trading window: **June 22–28, 2026**. Build locks **June 21, 2026**.

## The thesis

Track 1 is judged on **real, live PnL over a ~7-day window with a hard max-drawdown cap**.
Over 7 days and a handful of trades, exotic alpha can't be proven statistically — but
blowups can. Most entrants will over-leverage and trip the drawdown gate.

**GlassBox wins by surviving.** It rests in stablecoins by default, deploys only on
high-conviction signals, and hard-flattens at an *internal* drawdown ceiling well inside
the competition's cap. Every decision is a human-readable, on-chain-anchored reasoning
artifact (OpenAlice-style transparency). All three sponsor stacks are wired cleanly to
sweep the $2,000 special prizes.

**Core principle: the LLM proposes, the deterministic risk gate disposes.**
The model never touches the wallet directly.

## Architecture

```
ORCHESTRATOR (heartbeat loop)
  → PERCEPTION  (CMC Agent Hub via MCP / x402)      → Signals
  → REASONING   (one auditable LLM call)            → TradeProposal   [proposes only]
  → RISK GATE   (pure Python, deterministic)        → GateDecision    [disposes]
  → EXECUTION   (TWAK self-custody signing)         → ExecutionResult
  → AUDIT (JSONL)  +  VERIFY (ERC-8004 hash anchor)
  → DASHBOARD   (live positions, reasoning log, DD gauge, proof links)
```

## Quick start

```bash
pip install -e .
cp .env.example .env          # fill in keys when you wire live stacks
glassbox --mode paper --once  # runs one full perceive→reason→gate→execute→log cycle
glassbox --mode paper         # continuous paper-trading loop
```

The paper loop runs **with zero API keys** using a deterministic heuristic reasoner and a
simulated fill engine, so you have a working end-to-end cycle on day one. Swap in live
stacks (CMC, TWAK, BNB SDK) by filling `.env` and flipping `--mode live`.

## The three sponsor stacks

| Layer | Product | Role | Special prize |
|---|---|---|---|
| Data | **CMC Agent Hub** | decision-ready market signals (MCP / x402) | Best CMC ($2k) |
| Execution | **Trust Wallet Agent Kit (TWAK)** | self-custody decide→sign→execute on BSC | Best TWAK ($2k) |
| Identity | **BNB AI Agent SDK** | ERC-8004 identity + on-chain decision anchoring | Best BNB SDK ($2k) |

> ⚠️ The BNB AI Agent SDK is **testnet-only** at time of writing (mainnet contracts not
> deployed). Live mainnet trading runs through **TWAK**; the BNB SDK is a verifiability
> bolt-on for the identity/proof special prize. Re-check mainnet status in week 1.

See [CLAUDE.md](CLAUDE.md) for the full build brief.
