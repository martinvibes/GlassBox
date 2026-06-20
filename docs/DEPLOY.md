# Deploying GlassBox

GlassBox ships as **one container** that runs the Python trading agent **and** the
Next.js dashboard together, sharing one filesystem — exactly like local dev (the
dashboard reads the agent's audit files off the same disk). Recommended host:
**Railway** (also works on Render / Fly.io with the same Dockerfile).

Everything the build needs is committed: `Dockerfile`, `deploy/start.sh`,
`.dockerignore`, `railway.json`. Secrets (`.env`) and runtime state (`backend/data/`)
are gitignored and never shipped — they're provided as env vars + created at runtime.

---

## Deploy to Railway (≈5 minutes)

1. **Push the deploy files** to GitHub (repo: `martinvibes/GlassBox`):
   ```bash
   git add Dockerfile .dockerignore railway.json deploy/ docs/DEPLOY.md
   git commit -m "chore: containerized deploy (agent + dashboard)"
   git push
   ```

2. **Create the project** → [railway.com](https://railway.com) → **New Project** →
   **Deploy from GitHub repo** → pick `GlassBox`. Railway auto-detects the `Dockerfile`
   and builds it.

3. **Add a persistent volume** (so positions / audit log survive restarts) →
   service → **Variables/Settings → Volumes → New Volume** → mount path:
   ```
   /app/backend/data
   ```

4. **Set environment variables** (service → **Variables**):

   **Paper demo (safe — no real funds, recommended to start):**
   | Variable | Value |
   |---|---|
   | `GLASSBOX_MODE` | `paper` |
   | `ANTHROPIC_API_KEY` | `sk-ant-...` *(optional — enables the Claude brain; without it the agent uses its built-in heuristic)* |
   | `GLASSBOX_LLM_MODEL` | `claude-haiku-4-5-20251001` *(cheapest)* |
   | `GLASSBOX_HEARTBEAT_SECONDS` | `45` |

5. **Generate a domain** → service → **Settings → Networking → Generate Domain**.
   Railway maps it to the container's port (the dashboard). Open the URL — the live
   desk, with the agent trading paper behind it.

That's it. The agent auto-restarts if it ever exits; Railway restarts the container
if the dashboard does.

---

## Going live (real funds — the competition window)

When you're ready to trade real money, add the wallet/TWAK secrets and flip the mode.
**Only do this with funds you can afford — it broadcasts real on-chain swaps.**

| Variable | Value |
|---|---|
| `GLASSBOX_MODE` | `live` |
| `TWAK_ACCESS_ID` | *(from your TWAK app)* |
| `TWAK_HMAC_SECRET` | *(from your TWAK app)* |
| `TWAK_WALLET_ADDRESS` | `0x...` |
| `TWAK_WALLET_PASSWORD` | *(wallet password)* |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |

Redeploy. The dashboard's mode chip flips to **LIVE** and the same risk gate /
drawdown breaker / trailing stops apply — the model proposes, the gate disposes.

> Security note: secrets live in Railway's encrypted env vars, never in the image or
> git. Rotate the wallet password and API key after the event.

---

## Other hosts

The same `Dockerfile` works on **Render** (New → Web Service → Docker, add a Disk at
`/app/backend/data`) and **Fly.io** (`fly launch` → it detects the Dockerfile; add a
volume + set secrets with `fly secrets set`). Set the same env vars as above.
