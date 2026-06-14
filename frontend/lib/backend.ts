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

// Pull values from the YAML rulebook without a YAML dep.
export async function readRulebookCaps(): Promise<{
  competitionCapPct: number;
  internalCeilingPct: number;
  startEquity: number;
  maxPositionPct: number;
  minConviction: number;
  maxTradesPerDay: number;
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
    maxPositionPct: num(/max_position_pct:\s*([\d.]+)/, 25),
    minConviction: num(/min_score_to_enter:\s*([\d.]+)/, 0.62),
    maxTradesPerDay: num(/max_trades_per_day:\s*([\d.]+)/, 6),
  };
}

export async function readControl(): Promise<{ paused: boolean }> {
  const raw = await readText(path.join(DATA, "control.json"));
  if (!raw) return { paused: false };
  try {
    return { paused: !!JSON.parse(raw).paused };
  } catch {
    return { paused: false };
  }
}

export async function readMandate(): Promise<Record<string, number>> {
  const raw = await readText(path.join(DATA, "mandate.json"));
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeData(file: string, obj: unknown): Promise<void> {
  await fs.mkdir(DATA, { recursive: true });
  await fs.writeFile(path.join(DATA, file), JSON.stringify(obj, null, 2));
}

export async function writeControl(obj: { paused: boolean }): Promise<void> {
  await writeData("control.json", obj);
}

export async function writeMandate(obj: Record<string, number>): Promise<void> {
  await writeData("mandate.json", obj);
}
