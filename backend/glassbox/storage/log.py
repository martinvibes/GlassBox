"""Append-only JSONL audit log — the OpenAlice-style transparency layer.

One DecisionRecord per line, hash-chained (each record carries the previous
record's hash). This is the artifact judges inspect and the dashboard tails.
Append-only by discipline: we never rewrite history.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator, Optional

from glassbox.models import DecisionRecord


class AuditLog:
    def __init__(self, data_dir: Path) -> None:
        self.path = Path(data_dir) / "decisions.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def last_hash(self) -> Optional[str]:
        """Hash of the most recent record, to chain the next one."""
        last = None
        for rec in self.read():
            last = rec
        return last.canonical_hash() if last else None

    def next_cycle_id(self) -> int:
        n = 0
        for _ in self.read():
            n += 1
        return n

    def append(self, record: DecisionRecord) -> None:
        line = json.dumps(record.model_dump(mode="json"), separators=(",", ":"))
        with open(self.path, "a") as f:
            f.write(line + "\n")

    def read(self) -> Iterator[DecisionRecord]:
        if not self.path.exists():
            return
        with open(self.path, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    yield DecisionRecord.model_validate_json(line)

    def verify_chain(self) -> tuple[bool, Optional[int]]:
        """Verify the hash chain is intact. Returns (ok, first_bad_cycle_id)."""
        prev: Optional[str] = None
        for rec in self.read():
            if rec.prev_hash != prev:
                return False, rec.cycle_id
            prev = rec.canonical_hash()
        return True, None
