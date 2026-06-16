"""Reasoning layer — a single, auditable decision step.

This produces a `TradeProposal` (action + size + conviction + rationale). It is a
PROPOSAL only: the risk gate has the final say and the model never signs.

Two backends:
  * llm       — one structured Claude call (used when ANTHROPIC_API_KEY is set).
  * heuristic — a transparent, deterministic rule that runs with no API key, so
                paper mode always works and tests are reproducible.

Keep this layer THIN. No multi-agent circus, no meta-learner — over a 7-day / few-trade
window that only adds failure surface. The edge is discipline, not cleverness.
"""

from __future__ import annotations

import json

from glassbox.config import Settings
from glassbox.models import Action, Portfolio, Regime, Signals, TradeProposal
from glassbox.reasoning.memory import BrainMemory

SYSTEM_PROMPT = """You are GlassBox — a disciplined, LEARNING autonomous trading brain on
BNB Chain. You trade SPOT only (long or cash — no shorting, no leverage). You make money
two ways and pick the right one for the tape:
- MOMENTUM: when 1h/24h/7d momentum align UP, ride the strongest name.
- DIP-BUY (mean reversion): in a pullback inside a 7d UPTREND (24h red but 1h turning
  green), buy the oversold reclaim. This is where most money is made — pullbacks are
  constant, and sitting in cash through every dip makes nothing.
Only buy names in a 7d uptrend (never catch a falling knife in a downtrend). Take small
profits fast, cut losers fast, and NEVER approach the max-drawdown cap. Survival comes
from tight risk, not idleness — an agent that makes nothing loses to anyone with positive PnL.

Every cycle you are given:
- live SIGNALS — per-token MULTI-TIMEFRAME momentum (momentum_1h, momentum_24h,
  momentum_7d as fractions), regime, fear/greed, prices, liquidity,
- your PORTFOLIO (cash + open positions),
- your MEMORY: what has actually worked and failed for you THIS session — per-token win/
  loss and realized P&L, which tokens keep stopping you out — plus your evolving thesis
  and lessons.

Reason WITH your memory. If a token has stopped you out repeatedly, steer away from it. If
a token is carrying your book, trust it more. That feedback loop is your edge over
deterministic indicator bots that never learn.

Decide ONE action and output ONLY a JSON object:
{"action","symbol","size_pct","conviction","rationale","thesis","lesson"}
- action ∈ {buy,sell,hold}; symbol is a token from the signals (BNB=WBNB, BTC=BTCB, etc.).
  buy = open/rotate into the leader; sell = close a held position; hold = let a winner run
  or stay in cash.
- size_pct: % of equity to deploy (0-15). conviction: 0..1 (the gate enforces a floor).
- rationale: ONE crisp, honest sentence — logged verbatim and shown to judges.
- thesis: your updated 1-2 sentence market read (persisted as memory for next cycle).
- lesson: a one-line lesson if an outcome taught you something this session, else "".
Hard take-profit / stop-loss exits run BEFORE you, deterministically — lean the same way.
The risk gate has the final say and clamps your size; you never sign a transaction.
"""


class Reasoner:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        self._use_llm = bool(settings.anthropic_api_key)
        self.memory = BrainMemory(settings.data_dir)

    def propose(self, signals: Signals, portfolio: Portfolio) -> TradeProposal:
        # Exits come FIRST and are deterministic: a position past its take-profit or
        # stop-loss threshold is closed regardless of what the LLM/heuristic wants.
        # Banking small wins (and cutting losers early) is the whole survival thesis.
        exit_proposal = self._check_exits(signals, portfolio)
        if exit_proposal is not None:
            return exit_proposal

        # the closed-loop brain: read this session's performance memory, reason WITH it.
        perf = self.memory.performance()
        # Think hard (one Claude call) only at genuine DECISION POINTS — flat, or holding
        # something that's no longer the leader. Holding the leader is a cheap, instant
        # HOLD, so the agent stays responsive and doesn't burn the API saying "hold".
        if self._use_llm and self._is_decision_point(signals, portfolio):
            try:
                return self._llm_propose(signals, portfolio, perf)
            except Exception as exc:
                p = self._heuristic_propose(signals, portfolio, perf)
                p.rationale = f"[LLM failed: {exc}; used heuristic] " + p.rationale
                p.source = "heuristic(fallback)"
                return p
        return self._heuristic_propose(signals, portfolio, perf)

    def _is_decision_point(self, signals: Signals, portfolio: Portfolio) -> bool:
        """Cheap pre-check: is there a non-trivial decision to make? True when flat
        (consider an entry) or holding a name that's no longer the momentum leader
        (consider a rotation). Otherwise we're just letting a winner run → no LLM."""
        def is_stable(s: str) -> bool:
            tok = self.s.allowlist.get(s)
            return bool(tok and tok.is_stable)
        volatile_held = [s for s in portfolio.positions if not is_stable(s)]
        if not volatile_held:
            return True
        ranked = sorted(
            ((float(b.get("momentum_24h", 0.0)), s) for s, b in (signals.tokens or {}).items()
             if s in self.s.allowlist and not is_stable(s)),
            reverse=True,
        )
        leader = ranked[0][1] if ranked else None
        return leader not in volatile_held

    # ── deterministic exits: take small profits, cut losers ─────────────────
    def _check_exits(self, signals: Signals, portfolio: Portfolio) -> TradeProposal | None:
        """Scan open positions; close any that hit the take-profit or stop-loss
        threshold. Stop-losses are prioritized over take-profits (survival first).
        Returns a SELL proposal for the most urgent position, or None."""
        ex = self.s.rulebook.get("exits", {})
        tp = float(ex.get("take_profit_pct", 0) or 0)
        sl = float(ex.get("stop_loss_pct", 0) or 0)
        if not portfolio.positions or (tp <= 0 and sl <= 0):
            return None

        losers: list[tuple[float, str]] = []
        winners: list[tuple[float, str]] = []
        for sym, pos in portfolio.positions.items():
            tok = self.s.allowlist.get(sym)
            if (tok and tok.is_stable) or pos.avg_price_usd <= 0:
                continue  # never "take profit" on a stablecoin
            mark = signals.prices_usd.get(sym, pos.avg_price_usd)
            pnl_pct = (mark - pos.avg_price_usd) / pos.avg_price_usd * 100.0
            if sl > 0 and pnl_pct <= -sl:
                losers.append((pnl_pct, sym))
            elif tp > 0 and pnl_pct >= tp:
                winners.append((pnl_pct, sym))

        if losers:  # cut the worst loser first
            pnl_pct, sym = min(losers)
            return TradeProposal(
                action=Action.SELL, symbol=sym, size_pct=100.0, conviction=0.95,
                rationale=(f"stop-loss: {sym} at {pnl_pct:+.2f}% ≤ −{sl:.1f}% threshold "
                           f"→ cut the loser back to stablecoin, well inside the DD ceiling."),
                proposed_regime=signals.regime, source="exit:stop_loss",
            )
        if winners:  # else bank the biggest winner
            pnl_pct, sym = max(winners)
            return TradeProposal(
                action=Action.SELL, symbol=sym, size_pct=100.0, conviction=0.95,
                rationale=(f"take-profit: {sym} at {pnl_pct:+.2f}% ≥ +{tp:.1f}% threshold "
                           f"→ bank the gain. A green trade is a closed trade."),
                proposed_regime=signals.regime, source="exit:take_profit",
            )
        return None

    # ── LLM backend ────────────────────────────────────────────────────────
    def _llm_propose(self, signals: Signals, portfolio: Portfolio, perf: dict) -> TradeProposal:
        from anthropic import Anthropic  # imported lazily; optional dependency

        client = Anthropic(api_key=self.s.anthropic_api_key)
        user_payload = {
            "signals": signals.model_dump(mode="json"),
            "portfolio": portfolio.model_dump(mode="json"),
            "memory": self.memory.prompt_block(perf),
            "rulebook_hint": {
                "max_trade_pct": self.s.rulebook["sizing"]["max_trade_pct"],
                "min_conviction_to_enter": self.s.rulebook["conviction"]["min_score_to_enter"],
                "take_profit_pct": self.s.rulebook.get("exits", {}).get("take_profit_pct"),
                "stop_loss_pct": self.s.rulebook.get("exits", {}).get("stop_loss_pct"),
            },
        }
        msg = client.messages.create(
            model=self.s.llm_model,
            max_tokens=700,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(user_payload)}],
        )
        text = "".join(block.text for block in msg.content if block.type == "text")
        proposal, thesis, lesson = self._parse(text, signals, source="llm")
        # CLOSE THE LOOP: the model's evolving read becomes memory for the next cycle.
        self.memory.update(thesis=thesis, lesson=lesson)
        return proposal

    @staticmethod
    def _parse(text: str, signals: Signals, source: str) -> tuple[TradeProposal, str, str]:
        """Fail-safe parse → (proposal, thesis, lesson). Malformed output → HOLD."""
        try:
            start, end = text.find("{"), text.rfind("}")
            data = json.loads(text[start : end + 1])
            action = Action(str(data.get("action", "hold")).lower())
            proposal = TradeProposal(
                action=action,
                symbol=str(data.get("symbol", "")).upper(),
                size_pct=float(data.get("size_pct", 0.0)),
                conviction=float(data.get("conviction", 0.0)),
                rationale=str(data.get("rationale", ""))[:1000],
                proposed_regime=signals.regime,
                source=source,
            )
            return proposal, str(data.get("thesis", "")), str(data.get("lesson", ""))
        except Exception as exc:
            fallback = TradeProposal(
                action=Action.HOLD,
                conviction=0.0,
                rationale=f"unparseable model output → fail-safe HOLD ({exc})",
                proposed_regime=signals.regime,
                source=f"{source}(parsefail)",
            )
            return fallback, "", ""

    # ── Heuristic backend: active, disciplined momentum rotation that LEARNS ──
    def _heuristic_propose(self, signals: Signals, portfolio: Portfolio, perf: dict) -> TradeProposal:
        """Always try to hold the single strongest-momentum token, sized by the
        gate's regime posture, with take-profit / stop-loss exits (checked first,
        in `propose`) and the drawdown breaker doing the risk work. Only true
        capitulation (risk_off) stands the agent fully down. It also LEARNS: tokens
        that keep stopping it out this session are steered around (closed-loop memory,
        unlike a static indicator bot)."""

        def _is_stable(s: str) -> bool:
            tok = self.s.allowlist.get(s)
            return bool(tok and tok.is_stable)

        def _val(s: str) -> float:
            p = portfolio.positions[s]
            return p.value_usd(signals.prices_usd.get(s, p.avg_price_usd))

        volatile_held = [s for s in portfolio.positions if not _is_stable(s)]

        # 0. true capitulation → de-risk to stablecoin (never churn stables)
        if signals.regime == Regime.RISK_OFF:
            if volatile_held:
                sym = max(volatile_held, key=_val)
                return TradeProposal(
                    action=Action.SELL, symbol=sym, size_pct=100.0, conviction=0.9,
                    rationale="risk_off capitulation → flatten the largest position to stablecoin.",
                    proposed_regime=signals.regime, source="heuristic",
                )
            return TradeProposal(
                action=Action.HOLD, conviction=0.9,
                rationale="risk_off capitulation → rest in stablecoin until the tape stabilizes.",
                proposed_regime=signals.regime, source="heuristic",
            )

        # 1. score every allowlisted token across timeframes. We only buy names in a
        #    7d UPTREND (never a falling knife), entered either on momentum continuation
        #    (24h green) or an OVERSOLD RECLAIM — a dip inside the uptrend turning back up
        #    (24h red, 1h green). That captures BOTH trends and chop, where pure 24h
        #    momentum would just sit in cash through every pullback and make nothing.
        def _score(b: dict) -> tuple[float, str]:
            m1 = float(b.get("momentum_1h", 0.0))
            m24 = float(b.get("momentum_24h", 0.0))
            m7 = float(b.get("momentum_7d", 0.0))
            if m7 <= 0.0:
                return -1.0, "downtrend"                # no uptrend → skip (no knife-catching)
            if m24 >= 0.0:
                return m7 * 0.4 + m24, "momentum"        # trend continuation
            if m1 > 0.0:
                return m7 * 0.4 + m1 * 2.0, "dip"        # oversold reclaim — buy the dip
            return m7 * 0.15 - 0.01, "falling"           # still dropping in uptrend → wait

        scored: list[tuple[float, str, str]] = []
        for sym, blob in (signals.tokens or {}).items():
            if sym not in self.s.allowlist or _is_stable(sym):
                continue
            slip = blob.get("est_slippage_bps")
            if slip is not None and float(slip) > self.s.rulebook["limits"]["max_slippage_bps"]:
                continue
            sc, kind = _score(blob)
            scored.append((sc, sym, kind))
        if not scored:
            return TradeProposal(
                action=Action.HOLD, conviction=0.6,
                rationale="no live token signals yet → hold cash for a cycle.",
                proposed_regime=signals.regime, source="heuristic",
            )
        scored.sort(key=lambda t: t[0], reverse=True)

        # LEARN: steer around tokens that keep stopping us out this session.
        avoid = self.memory.avoid_set(perf)
        healthy = [t for t in scored if t[1] not in avoid] or scored
        best_score, best_sym, best_kind = healthy[0]
        bb = signals.tokens.get(best_sym, {})
        m24 = float(bb.get("momentum_24h", 0.0)) * 100
        m7 = float(bb.get("momentum_7d", 0.0)) * 100

        # heuristic owns the thesis only when it is the primary brain (Claude owns it
        # otherwise and must not be clobbered on the cheap hold cycles).
        if not self._use_llm:
            rt = perf.get("realized_total", 0.0)
            thesis = (f"{signals.regime.value}; best entry {best_sym} "
                      f"({best_kind}: 24h {m24:+.1f}% / 7d {m7:+.1f}%). "
                      f"Session {'+' if rt >= 0 else ''}{rt:.2f} USD.")
            if avoid:
                thesis += f" Avoiding {', '.join(sorted(avoid))} (stopped out)."
                worst = max(avoid, key=lambda s: perf["tokens"][s]["stops"])
                self.memory.update(lesson=f"{worst} stopped me out "
                                   f"{perf['tokens'][worst]['stops']}x — avoiding it this session.")
            self.memory.update(thesis=thesis)

        # 2. no token in a clean 7d uptrend with a turn → don't enter; hold what we have
        #    (exits manage it) or rest in cash. Survival: never chase a downtrend.
        if best_score <= 0.0:
            if volatile_held:
                return TradeProposal(
                    action=Action.HOLD, conviction=0.6,
                    rationale="no fresh uptrend entry → hold the open position; exits manage it.",
                    proposed_regime=signals.regime, source="heuristic",
                )
            return TradeProposal(
                action=Action.HOLD, conviction=0.7,
                rationale="no token in a 7d uptrend with a clean turn → rest in stablecoin.",
                proposed_regime=signals.regime, source="heuristic",
            )

        # 3. converge to the single best name: rotate out of anything else (one per cycle)
        laggards = [s for s in volatile_held if s != best_sym]
        if laggards:
            weak = max(laggards, key=_val)
            return TradeProposal(
                action=Action.SELL, symbol=weak, size_pct=100.0, conviction=0.85,
                rationale=(f"rotate: {weak} is no longer the best risk/reward → sell to cash, "
                           f"concentrate into {best_sym}."),
                proposed_regime=signals.regime, source="heuristic",
            )

        # 4. already holding the best name → let it ride; exits manage TP/SL
        if best_sym in volatile_held:
            return TradeProposal(
                action=Action.HOLD, conviction=0.7,
                rationale=(f"holding {best_sym} ({best_kind}; 7d {m7:+.1f}%) → let it work; "
                           f"take-profit / stop-loss manage the exit."),
                proposed_regime=signals.regime, source="heuristic",
            )

        # 5. flat → deploy into the best name (momentum continuation OR dip-buy)
        conviction = round(max(0.5, min(0.93, 0.6 + best_score * 3.0)), 2)
        size = min(self.s.rulebook["sizing"]["max_trade_pct"], 12.0)
        ex = self.s.rulebook.get("exits", {})
        if best_kind == "dip":
            why = (f"{best_sym} oversold reclaim — a dip inside a 7d uptrend ({m7:+.1f}% 7d) "
                   f"turning back up; buy the dip")
        elif best_kind == "momentum":
            why = f"{best_sym} on aligned momentum (24h {m24:+.1f}%, 7d {m7:+.1f}%); ride it"
        else:  # falling — pullback inside a strong uptrend, not yet reclaimed
            why = (f"{best_sym} pulling back inside a strong 7d uptrend ({m7:+.1f}%) — small "
                   f"early probe with a tight stop, betting the trend resumes")
        return TradeProposal(
            action=Action.BUY, symbol=best_sym, size_pct=size, conviction=conviction,
            rationale=(f"{why} → disciplined probe; take-profit +{ex.get('take_profit_pct', 1.5)}%, "
                       f"stop −{ex.get('stop_loss_pct', 3)}%."),
            proposed_regime=signals.regime, source="heuristic",
        )
