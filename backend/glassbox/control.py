"""Operator controls set from the dashboard — read fresh every cycle so changes
apply live without a restart.

  data/control.json  → {"paused": bool}                  (Agent Console pause/resume)
  data/mandate.json  → partial risk overrides            (Agent Console risk sliders)

Mandate overrides are layered over rules/rulebook.yaml; the source rulebook is
never mutated. Unknown/missing keys fall back to the rulebook defaults.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _read_json(path: Path) -> dict[str, Any]:
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            return {}
    return {}


def read_control(data_dir: Path) -> dict[str, Any]:
    return _read_json(Path(data_dir) / "control.json")


def read_mandate(data_dir: Path) -> dict[str, Any]:
    return _read_json(Path(data_dir) / "mandate.json")


def apply_mandate(rulebook: dict[str, Any], mandate: dict[str, Any]) -> None:
    """Layer the dashboard's risk mandate over the rulebook in place."""
    try:
        if "internal_ceiling_pct" in mandate:
            rulebook["drawdown"]["internal_ceiling_pct"] = float(mandate["internal_ceiling_pct"])
        if "max_position_pct" in mandate:
            rulebook["sizing"]["max_position_pct"] = float(mandate["max_position_pct"])
        if "min_score_to_enter" in mandate:
            rulebook["conviction"]["min_score_to_enter"] = float(mandate["min_score_to_enter"])
        if "max_trades_per_day" in mandate:
            rulebook["limits"]["max_trades_per_day"] = int(mandate["max_trades_per_day"])
    except (KeyError, TypeError, ValueError):
        pass  # malformed mandate → keep rulebook defaults (fail-safe)
