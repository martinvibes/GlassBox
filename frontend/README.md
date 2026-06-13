# GlassBox — frontend (the transparency dashboard)

A dark "glass trading terminal": real TradingView candlestick charts, a hero **drawdown
gauge** that proves the survival thesis, a live **reasoning feed** (the agent's audit log),
positions, and on-chain proof links. Editorial serif + monospace data, mint/danger accent
system, grain + glow atmosphere.

**Built with:** Next.js 15 (App Router, TS) · Tailwind v4 · lightweight-charts (TradingView)
· framer-motion. Fonts: Instrument Serif / IBM Plex Mono / Schibsted Grotesk.

## Run

```bash
cd frontend
npm install
npm run dev        # → http://localhost:4555
```

It reads the **real** backend artifacts (no mock data):
- `../backend/data/decisions.jsonl` — hash-chained reasoning/audit log → feed + equity curve
- `../backend/data/portfolio.json` — positions + high-water mark
- `../backend/data/agent_identity.json` — ERC-8004 id (if registered)
- `../backend/.env` + `../backend/rules/rulebook.yaml` — wallet, mode, drawdown caps

Price candles are **real OHLC** proxied from CoinGecko (keyless). The whole UI polls every 5s.

> Tip: populate the feed/curve first by running the backend a few times:
> `cd ../backend && . .venv/bin/activate && for i in $(seq 8); do glassbox --mode paper --once; sleep 8; done`
> (the `sleep` avoids CoinGecko rate limits — without it, cycles degrade to the safe risk-off view).

## Layout
- **TopBar** — wordmark, live regime pill, mode/cycles/wallet, UTC clock.
- **Hero** — drawdown gauge (safe→DQ zones) · total equity + net PnL · F&G / high-water / cycles / posture tiles.
- **Charts** — BNB/BTC/ETH/CAKE candlesticks (24h) · equity area curve vs. start baseline.
- **Feed + Positions** — streaming decision log with gate verdicts + rationale · holdings + ERC-8004 / wallet / chain proof.

## API routes (server-side, read-only)
- `GET /api/state` — portfolio, equity series, drawdown, regime, caps, wallet, agent id
- `GET /api/decisions?limit=N` — newest-first decision records
- `GET /api/candles?symbol=BNB&days=1` — real OHLC from CoinGecko
