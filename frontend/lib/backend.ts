// Server-only: reads the REAL backend artifacts (audit log, portfolio, rulebook,
// identity, env). No mock data — if a file is missing we return nulls.
import { promises as fs } from "fs";
import path from "path";
import type { DecisionRecord, Portfolio } from "./types";

const BACKEND = path.join(process.cwd(), "..", "backend");
const DATA = path.join(BACKEND, "data");

async function readText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export async function readDecisions(limit?: number): Promise<DecisionRecord[]> {
  const raw = await readText(path.join(DATA, "decisions.jsonl"));
  if (!raw) return [];
  const lines = raw.split("\n").filter((l) => l.trim());
  const recs: DecisionRecord[] = [];
  for (const line of lines) {
    try {
      recs.push(JSON.parse(line));
    } catch {
      /* skip malformed line */
    }
  }
  return limit ? recs.slice(-limit) : recs;
}

export async function readPortfolio(): Promise<Portfolio | null> {
  const raw = await readText(path.join(DATA, "portfolio.json"));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function readAgentId(): Promise<string | null> {
  const raw = await readText(path.join(DATA, "agent_identity.json"));
  if (!raw) return null;
  try {
    return JSON.parse(raw).agent_id ?? null;
  } catch {
    return null;
  }
}

// Minimal .env parse (server-side) to surface wallet + mode in the UI.
export async function readEnv(): Promise<Record<string, string>> {
  const raw = await readText(path.join(BACKEND, ".env"));
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) {
      out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

// Pull a couple of values from the YAML rulebook without a YAML dep.
export async function readRulebookCaps(): Promise<{
  competitionCapPct: number;
  internalCeilingPct: number;
  startEquity: number;
}> {
  const raw = await readText(path.join(BACKEND, "rules", "rulebook.yaml"));
  const num = (re: RegExp, dflt: number) => {
    const m = raw?.match(re);
    return m ? parseFloat(m[1]) : dflt;
  };
  return {
    competitionCapPct: num(/competition_cap_pct:\s*([\d.]+)/, 30),
    internalCeilingPct: num(/internal_ceiling_pct:\s*([\d.]+)/, 12),
    startEquity: num(/starting_equity_usd:\s*([\d.]+)/, 1000),
  };
}
