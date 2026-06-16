"""GlassBox brain memory — a CLOSED-LOOP, persistent reasoning memory.

A competitor's agent writes a pretty MEMORY.md journal it never reads back: a
diary, not a brain. Ours is *functional*. Before every decision the agent reads
what it has learned this session; after every outcome it updates that memory. The
loop is: memory → reason → trade → reflect → memory. That feedback is what makes
it actually learn within a session (deterministic indicator bots cannot).

Two layers:
  * performance — recomputed fresh from the append-only audit log every cycle
    (per-token W/L, realized PnL, stop-outs). Always accurate, never drifts.
  * thesis + lessons — the agent's evolving qualitative read, persisted to disk and
    fed straight back into the next decision. This is the part that learns.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any


class BrainMemory:
    def __init__(self, data_dir) -> None:
        self.path = Path(data_dir) / "brain_memory.json"
        self.log_path = Path(data_dir) / "decisions.jsonl"
        self.thesis: str = ""
        self.lessons: list[str] = []
        self._load()

    # ── persisted qualitative memory (thesis + lessons) ──────────────────────
    def _load(self) -> None:
        try:
            d = json.loads(self.path.read_text())
            self.thesis = str(d.get("thesis", ""))
            self.lessons = [str(x) for x in d.get("lessons", [])][:8]
        except Exception:
            pass

    def update(self, thesis: str | None = None, lesson: str | None = None) -> None:
        """Evolve the qualitative memory and persist it (best-effort)."""
        if thesis and thesis.strip():
            self.thesis = thesis.strip()[:400]
        if lesson and lesson.strip():
            ln = lesson.strip()[:200]
            if ln and ln.lower() not in (x.lower() for x in self.lessons):
                self.lessons = ([ln] + self.lessons)[:8]
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps({"thesis": self.thesis, "lessons": self.lessons}, indent=2))
        except Exception:
            pass

    # ── live performance, computed from the audit log ────────────────────────
    def recent_records(self, n: int = 300) -> list[dict]:
        try:
            lines = self.log_path.read_text().splitlines()[-n:]
            return [json.loads(ln) for ln in lines if ln.strip()]
        except Exception:
            return []

    def performance(self, records: list[dict] | None = None) -> dict[str, Any]:
        """Per-token scorecard + session totals from CLOSED trades (realized P&L)."""
        recs = records if records is not None else self.recent_records()
        tok: dict[str, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "pnl": 0.0, "stops": 0, "tps": 0})
        realized_total = 0.0
        closes = 0
        for r in recs:
            e = r.get("execution") or {}
            rp = float(e.get("realized_pnl_usd", 0.0) or 0.0)
            if e.get("action") == "sell" and abs(rp) > 1e-9:
                sym = e.get("symbol", "?")
                t = tok[sym]
                t["pnl"] += rp
                (t.__setitem__("wins", t["wins"] + 1) if rp > 0 else t.__setitem__("losses", t["losses"] + 1))
                src = (r.get("proposal") or {}).get("source", "")
                if src == "exit:stop_loss":
                    t["stops"] += 1
                elif src == "exit:take_profit":
                    t["tps"] += 1
                realized_total += rp
                closes += 1
        for t in tok.values():
            t["pnl"] = round(t["pnl"], 2)
            n = t["wins"] + t["losses"]
            t["win_rate"] = round(t["wins"] / n * 100, 0) if n else 0.0
        return {"tokens": dict(tok), "realized_total": round(realized_total, 2), "closed_trades": closes}

    def avoid_set(self, perf: dict[str, Any], stop_threshold: int = 2) -> set[str]:
        """Tokens that have hard-stopped repeatedly this session — the heuristic
        steers around them (a deterministic version of 'learning from pain')."""
        return {sym for sym, t in perf["tokens"].items() if t.get("stops", 0) >= stop_threshold}

    # ── formatting for the LLM prompt + the dashboard ────────────────────────
    def prompt_block(self, perf: dict[str, Any]) -> str:
        lines = []
        rt = perf["realized_total"]
        lines.append(f"session realized P&L: {'+' if rt >= 0 else ''}{rt:.2f} USD over {perf['closed_trades']} closed trades")
        ranked = sorted(perf["tokens"].items(), key=lambda kv: kv[1]["pnl"], reverse=True)
        for sym, t in ranked[:6]:
            tag = f" [stopped {t['stops']}x]" if t.get("stops") else ""
            lines.append(f"  {sym}: {t['wins']}W/{t['losses']}L, {'+' if t['pnl'] >= 0 else ''}{t['pnl']:.2f} USD{tag}")
        if self.thesis:
            lines.append(f"your current thesis: {self.thesis}")
        if self.lessons:
            lines.append("lessons learned this session:")
            for ln in self.lessons[:5]:
                lines.append(f"  - {ln}")
        return "\n".join(lines)

    def snapshot(self, perf: dict[str, Any]) -> dict[str, Any]:
        """Compact JSON the dashboard renders as the live 'Brain' panel."""
        return {
            "thesis": self.thesis,
            "lessons": self.lessons[:6],
            "realized_total": perf["realized_total"],
            "closed_trades": perf["closed_trades"],
            "tokens": perf["tokens"],
        }
