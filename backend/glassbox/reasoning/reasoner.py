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

You run a PORTFOLIO: hold up to several different names at once (the gate caps total
exposure and per-name size). Each cycle, make ONE move — ADD the best fresh setup you don't
already hold while you have room, PRUNE a held name that has left its 7d uptrend, or HOLD
and let winners run. Diversify into the best setups across markets; don't pile into one name.

Every cycle you are given (compact):
- market — regime, fear/greed, BTC 24h.
- portfolio — cash, equity, and your held names with live gain%.
- fresh_candidates — pre-scored uptrend names you DON'T hold, each with 1h/24h/7d
  momentum and a "kind" (momentum or dip-reclaim), ranked best-first. Pick from these.
- memory — what has worked and failed for you THIS session (per-token win/loss and
  realized P&L, which names keep stopping you out) plus your evolving thesis and lessons.

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

    @staticmethod
    def _score_token(b: dict) -> tuple[float, str]:
        """Multi-timeframe entry score. We are PATIENT and SELECTIVE — only two setups
        ever score positive, both requiring a 7d uptrend AND short-term confirmation:
          * momentum: 1h AND 24h both green (trend continuation), or
          * reclaim:  24h red but 1h GREEN (an oversold dip actually turning back up).
        A still-falling name (1h red) scores negative — we WAIT for the reclaim instead
        of catching the knife at market. Shared by the heuristic and the LLM gate."""
        m1 = float(b.get("momentum_1h", 0.0))
        m24 = float(b.get("momentum_24h", 0.0))
        m7 = float(b.get("momentum_7d", 0.0))
        if m7 <= 0.0:
            return -1.0, "downtrend"            # no weekly uptrend → never
        if m24 >= 0.0:
            # momentum continuation — 24h green is the confirmation (1h is just a bonus)
            return m7 * 0.4 + m24 + max(0.0, m1), "momentum"
        # dip (24h red): only buy if the 1h is RECLAIMING (turning back up). Still
        # falling → wait, don't catch the knife at market.
        if m1 > 0.0:
            return m7 * 0.4 + m1 * 2.0, "dip"
        return -1.0, "falling"

    def _is_decision_point(self, signals: Signals, portfolio: Portfolio) -> bool:
        """Cheap pre-check: is there a non-trivial portfolio decision? True when a held
        name has left its 7d uptrend (prune), or there's a free slot AND a fresh uptrend
        candidate we don't already hold (add). Otherwise we're just letting winners run."""
        def is_stable(s: str) -> bool:
            tok = self.s.allowlist.get(s)
            return bool(tok and tok.is_stable)
        volatile_held = [s for s in portfolio.positions if not is_stable(s)]
        scored = {s: self._score_token(b) for s, b in (signals.tokens or {}).items()
                  if s in self.s.allowlist and not is_stable(s)}
        # a held name broke its uptrend → decide (prune)
        if any(scored.get(s, (-1.0, ""))[0] <= 0.0 for s in volatile_held):
            return True
        # free slot + a fresh candidate that's a GOOD opportunity (clears the fear-scaled
        # bar and is an allowed setup) → decide (add). Otherwise we hold / let winners run.
        max_slots = int(self.s.rulebook["sizing"].get("max_concurrent_positions", 6))
        fresh = any(self._is_opportunity(sc, kind, signals) and s not in volatile_held
                    for s, (sc, kind) in scored.items())
        return len(volatile_held) < max_slots and fresh

    def _entry_bar(self, signals: Signals) -> float:
        """Quality bar with a MILD lift as fear deepens — selective, but still trades
        genuine setups consistently rather than going idle through every fearful tape."""
        base = float(self.s.rulebook.get("conviction_entry", {}).get("min_entry_score", 0.012) or 0.012)
        fg = signals.fear_greed if signals.fear_greed is not None else 50
        return base * (1.0 + max(0, 30 - fg) / 60.0)   # e.g. F&G 15 → ×1.25, F&G ≥30 → ×1.0

    def _is_opportunity(self, score: float, kind: str, signals: Signals) -> bool:
        """A 'good trade' = clears the bar. Both momentum (24h green) and reclaim dips
        (24h red but 1h turning UP) qualify — the 1h-reclaim requirement already keeps us
        out of falling knives, and the tight stop caps any setup that fails."""
        return score >= self._entry_bar(signals)

    # ── deterministic exits: trailing stop, hard stop, take-profit backstop ──
    def _check_exits(self, signals: Signals, portfolio: Portfolio) -> TradeProposal | None:
        """Update each position's peak, then close the most urgent one:
          1. TRAILING stop — once armed (+arm%), exit if price falls trail% below its
             peak. This banks gains and makes a trade 'almost never close red'.
          2. HARD stop — an un-armed position at −stop% is cut (survival).
          3. TAKE-PROFIT backstop — a fast spike past +tp% is taken outright.
        Mutates pos.peak_price_usd (persisted with the portfolio)."""
        ex = self.s.rulebook.get("exits", {})
        tp = float(ex.get("take_profit_pct", 0) or 0)
        sl = float(ex.get("stop_loss_pct", 0) or 0)
        arm = float(ex.get("trail_arm_pct", 0) or 0)
        trail = float(ex.get("trail_distance_pct", 0) or 0)
        if not portfolio.positions:
            return None

        trails: list[tuple[float, str, float]] = []  # (gain_now, sym, peak_gain)
        losers: list[tuple[float, str]] = []
        takes: list[tuple[float, str]] = []
        for sym, pos in portfolio.positions.items():
            tok = self.s.allowlist.get(sym)
            if (tok and tok.is_stable) or pos.avg_price_usd <= 0:
                continue  # stablecoins are cash, not trades
            mark = signals.prices_usd.get(sym, pos.avg_price_usd)
            # update the running peak (init to entry on first sight)
            pos.peak_price_usd = max(pos.peak_price_usd or pos.avg_price_usd, mark)
            gain = (mark - pos.avg_price_usd) / pos.avg_price_usd * 100.0
            peak_gain = (pos.peak_price_usd - pos.avg_price_usd) / pos.avg_price_usd * 100.0
            armed = arm > 0 and peak_gain >= arm
            if armed and gain <= peak_gain - trail:
                trails.append((gain, sym, peak_gain))
            elif sl > 0 and gain <= -sl:
                losers.append((gain, sym))
            elif tp > 0 and gain >= tp:
                takes.append((gain, sym))

        if trails:  # bank the armed winner that pulled back from its peak
            gain, sym, peak_gain = max(trails, key=lambda t: t[2])
            return TradeProposal(
                action=Action.SELL, symbol=sym, size_pct=100.0, conviction=0.95,
                rationale=(f"trailing stop: {sym} peaked +{peak_gain:.2f}%, pulled back to "
                           f"{gain:+.2f}% → lock the gain (a green trade is a closed trade)."),
                proposed_regime=signals.regime, source="exit:trailing",
            )
        if losers:  # cut the worst un-armed loser first
            gain, sym = min(losers)
            return TradeProposal(
                action=Action.SELL, symbol=sym, size_pct=100.0, conviction=0.95,
                rationale=(f"stop-loss: {sym} at {gain:+.2f}% ≤ −{sl:.1f}% → cut the loser, "
                           f"well inside the drawdown ceiling."),
                proposed_regime=signals.regime, source="exit:stop_loss",
            )
        if takes:  # fast spike past the hard backstop
            gain, sym = max(takes)
            return TradeProposal(
                action=Action.SELL, symbol=sym, size_pct=100.0, conviction=0.95,
                rationale=f"take-profit: {sym} spiked to {gain:+.2f}% ≥ +{tp:.1f}% → bank it.",
                proposed_regime=signals.regime, source="exit:take_profit",
            )
        return None

    # ── LLM backend ────────────────────────────────────────────────────────
    def _llm_propose(self, signals: Signals, portfolio: Portfolio, perf: dict) -> TradeProposal:
        from anthropic import Anthropic  # imported lazily; optional dependency

        client = Anthropic(api_key=self.s.anthropic_api_key)
        # PORTFOLIO BRIEF — make diversification explicit: what we hold, how many free
        # slots, and the fresh uptrend names we DON'T yet hold (rank-ordered). The model
        # should fill empty slots with NEW names, not pile into one.
        held = [s for s, t in self.s.allowlist.items()
                if s in portfolio.positions and not t.is_stable]
        max_slots = int(self.s.rulebook["sizing"].get("max_concurrent_positions", 6))
        fresh: list[dict] = []
        for sym, blob in (signals.tokens or {}).items():
            if sym not in self.s.allowlist or self.s.allowlist[sym].is_stable or sym in held:
                continue
            sc, kind = self._score_token(blob)
            if self._is_opportunity(sc, kind, signals):
                fresh.append({"symbol": sym, "kind": kind, "score": round(sc, 4),
                              "m1h": blob.get("momentum_1h"), "m24h": blob.get("momentum_24h"),
                              "m7d": blob.get("momentum_7d")})
        fresh.sort(key=lambda d: d["score"], reverse=True)
        slots_remaining = max(0, max_slots - len(held))
        # COMPACT payload — token-economical. The model only needs market context, what we
        # hold, and the pre-scored fresh candidates (exits are handled deterministically
        # before this call, so we don't ship full price tables or token blobs).
        held_brief = []
        for sym in held:
            pos = portfolio.positions[sym]
            mark = signals.prices_usd.get(sym, pos.avg_price_usd)
            gain = (mark - pos.avg_price_usd) / pos.avg_price_usd * 100.0 if pos.avg_price_usd else 0.0
            held_brief.append({"symbol": sym, "value_usd": round(pos.qty * mark, 2), "gain_pct": round(gain, 2)})
        user_payload = {
            "market": {"regime": signals.regime.value, "fear_greed": signals.fear_greed,
                       "btc_24h_pct": round(float((signals.tokens.get("BTCB") or {}).get("momentum_24h", 0.0)) * 100, 2)},
            "portfolio": {"cash_usd": round(portfolio.cash_usd, 2),
                          "equity_usd": round(portfolio.equity_usd(signals.prices_usd), 2),
                          "held": held_brief, "free_slots": slots_remaining},
            "memory": self.memory.prompt_block(perf),
            "fresh_candidates": fresh[:7],
            "guidance": (
                f"You hold {held or 'nothing'} with {slots_remaining} free slots. DIVERSIFY: "
                "with a free slot, ADD the top fresh candidate you don't already hold. Only add "
                "to an existing name if no fresh candidate is compelling."
            ),
            "limits": {"target_position_pct": self.s.rulebook["sizing"].get("target_position_pct"),
                       "max_trade_pct": self.s.rulebook["sizing"]["max_trade_pct"]},
        }
        msg = client.messages.create(
            model=self.s.llm_model,
            max_tokens=500,
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
        scored: list[tuple[float, str, str]] = []
        for sym, blob in (signals.tokens or {}).items():
            if sym not in self.s.allowlist or _is_stable(sym):
                continue
            slip = blob.get("est_slippage_bps")
            if slip is not None and float(slip) > self.s.rulebook["limits"]["max_slippage_bps"]:
                continue
            sc, kind = self._score_token(blob)
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

        # ── PORTFOLIO: hold up to N names at once, each in a 7d uptrend ───────────
        sizing = self.s.rulebook["sizing"]
        max_slots = int(sizing.get("max_concurrent_positions", 6))
        score_of = {s: sc for sc, s, _ in scored}

        # 2. PRUNE: sell any held name that LEFT its 7d uptrend (score ≤ 0) — free a slot
        #    for a better setup. (Take-profit / stop-loss still run first, per position.)
        broken = [s for s in volatile_held if score_of.get(s, -1.0) <= 0.0]
        if broken:
            weak = min(broken, key=lambda s: score_of.get(s, -1.0))
            b7 = float(signals.tokens.get(weak, {}).get("momentum_7d", 0.0)) * 100
            return TradeProposal(
                action=Action.SELL, symbol=weak, size_pct=100.0, conviction=0.85,
                rationale=f"{weak} left its 7d uptrend ({b7:+.1f}% 7d) → exit to cash, free the slot.",
                proposed_regime=signals.regime, source="heuristic",
            )

        # 3. ADD: if there's a free slot and a fresh candidate that's a GOOD OPPORTUNITY
        #    (clears the fear-scaled bar; momentum-only in fear) we don't already hold,
        #    deploy into it. When nothing qualifies → hold cash (don't force a trade).
        candidates = [(sc, s, k) for sc, s, k in healthy
                      if self._is_opportunity(sc, k, signals) and s not in volatile_held]
        if candidates and len(volatile_held) < max_slots:
            sc, sym, kind = candidates[0]
            bb2 = signals.tokens.get(sym, {})
            c24 = float(bb2.get("momentum_24h", 0.0)) * 100
            c7 = float(bb2.get("momentum_7d", 0.0)) * 100
            conviction = round(max(0.5, min(0.93, 0.6 + sc * 3.0)), 2)
            size = min(float(sizing["max_trade_pct"]), float(sizing.get("target_position_pct", 10.0)))
            ex = self.s.rulebook.get("exits", {})
            if kind == "dip":
                why = f"{sym} oversold reclaim inside a 7d uptrend ({c7:+.1f}% 7d) — buy the dip"
            elif kind == "momentum":
                why = f"{sym} aligned momentum (24h {c24:+.1f}%, 7d {c7:+.1f}%) — ride it"
            else:
                why = f"{sym} pullback inside a strong 7d uptrend ({c7:+.1f}%) — small early probe"
            held_note = f" (book: {len(volatile_held) + 1}/{max_slots} names)" if volatile_held else ""
            return TradeProposal(
                action=Action.BUY, symbol=sym, size_pct=size, conviction=conviction,
                rationale=(f"{why}{held_note} → take-profit +{ex.get('take_profit_pct', 1.5)}%, "
                           f"stop −{ex.get('stop_loss_pct', 3)}%."),
                proposed_regime=signals.regime, source="heuristic",
            )

        # 4. portfolio full / no new setups → hold; exits (TP/SL) manage each position
        if volatile_held:
            return TradeProposal(
                action=Action.HOLD, conviction=0.7,
                rationale=(f"holding {len(volatile_held)} name(s) in 7d uptrends → let them work; "
                           f"take-profit / stop-loss manage each exit."),
                proposed_regime=signals.regime, source="heuristic",
            )
        return TradeProposal(
            action=Action.HOLD, conviction=0.7,
            rationale="no token in a 7d uptrend with a clean turn → rest in stablecoin.",
            proposed_regime=signals.regime, source="heuristic",
        )
