# GlassBox — frontend (the transparency dashboard)

This is **the demo**. In a contest where transparency is the differentiator, the
live dashboard is what wins the panel: it streams the agent's reasoning, positions,
and risk posture in real time, with on-chain proof links.

## What it shows
- **Live positions & equity curve** vs. the high-water mark.
- **Drawdown gauge** — current DD against our internal ceiling and the competition cap.
  This visually proves "we never get close to the gate."
- **Reasoning feed** — tails the backend's `data/decisions.jsonl` audit log: every
  proposal, the gate's verdict + reasons, and the resulting fill. OpenAlice-style.
- **On-chain proof links** — each decision's ERC-8004 anchor tx (BscScan link).

## Planned stack
Start with a **Streamlit** app (fastest path to a working demo that reads the JSONL
log directly). If time allows, upgrade to a **Next.js** app that consumes a small
read-only API exposed by the backend (`backend/glassbox/api.py`, TODO).

```
frontend/
  streamlit_app.py     # v1 — reads ../backend/data/decisions.jsonl directly  (TODO)
  web/                 # v2 — Next.js dashboard against a backend API          (later)
```

## Data contract
The frontend is **read-only**. It never trades. It consumes:
- `backend/data/decisions.jsonl` — the hash-chained DecisionRecord stream.
- `backend/data/portfolio.json`  — current positions + high-water mark.

See `backend/glassbox/models.py` (`DecisionRecord`) for the exact schema.
