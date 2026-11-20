"""Byte-level BPE tokenizer, trained from scratch.

Every UTF-8 byte is a base token (ids 0..255), so any text — Kazakh letters,
emoji, code — round-trips exactly. Training repeatedly merges the most frequent
adjacent pair of tokens into a new token (id 256, 257, ...).
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path

# Split text into word-like chunks so merges never cross word boundaries.
_CHUNK_RE = re.compile(r"\s?\w+|\s?[^\w\s]+|\s+")


def _chunks(text: str) -> list[str]:
    return _CHUNK_RE.findall(text)


def _merge(seq: tuple[int, ...], pair: tuple[int, int], new_id: int) -> tuple[int, ...]:
    out: list[int] = []
    i = 0
    a, b = pair
    while i < len(seq):
        if i + 1 < len(seq) and seq[i] == a and seq[i + 1] == b:
            out.append(new_id)
            i += 2
        else:
            out.append(seq[i])
            i += 1
    return tuple(out)


class ByteBPETokenizer:
    def __init__(self, merges: list[tuple[int, int]] | None = None) -> None:
        self.merges: list[tuple[int, int]] = [tuple(m) for m in (merges or [])]
        self._rebuild()

    def _rebuild(self) -> None:
        self._ranks = {pair: i for i, pair in enumerate(self.merges)}
        self._bytes: list[bytes] = [bytes([i]) for i in range(256)]
        for a, b in self.merges:
            self._bytes.append(self._bytes[a] + self._bytes[b])

    @property
    def vocab_size(self) -> int:
        return 256 + len(self.merges)

    def train(self, text: str, vocab_size: int) -> None:
        if vocab_size < 256:
            raise ValueError("vocab_size must be >= 256")
        words = Counter(tuple(c.encode("utf-8")) for c in _chunks(text))
        merges: list[tuple[int, int]] = []
        while 256 + len(merges) < vocab_size:
            pairs: Counter[tuple[int, int]] = Counter()
            for seq, freq in words.items():
                for p in zip(seq, seq[1:]):
                    pairs[p] += freq
            if not pairs:
                break
            best_count = max(pairs.values())
            if best_count < 2:
                break
            best = min(p for p, c in pairs.items() if c == best_count)
            new_id = 256 + len(merges)
            merges.append(best)
            merged: Counter[tuple[int, ...]] = Counter()
            for seq, freq in words.items():
                merged[_merge(seq, best, new_id)] += freq
            words = merged
        self.merges = merges
        self._rebuild()

    def _encode_chunk(self, data: bytes) -> list[int]:
        seq = tuple(data)
        while len(seq) > 1:
            ranked = [(self._ranks[p], p) for p in zip(seq, seq[1:]) if p in self._ranks]
            if not ranked:
                break
            rank, pair = min(ranked)
            seq = _merge(seq, pair, 256 + rank)
        return list(seq)

    def encode(self, text: str) -> list[int]:
        ids: list[int] = []
        for chunk in _chunks(text):
            ids.extend(self._encode_chunk(chunk.encode("utf-8")))
        return ids

    def token_bytes(self, id: int) -> bytes:
        return self._bytes[id]

    def token_str(self, id: int) -> str:
        return self._bytes[id].decode("utf-8", errors="replace")

    def decode(self, ids: list[int]) -> str:
        return b"".join(self._bytes[i] for i in ids).decode("utf-8", errors="replace")

    def fingerprint(self) -> str:
        return hashlib.sha256(json.dumps(self.merges).encode()).hexdigest()

    def stats(self, text: str) -> dict:
        ids = self.encode(text)
        n_bytes = len(text.encode("utf-8"))
        return {
            "chars": len(text),
            "bytes": n_bytes,
            "tokens": len(ids),
            "bytes_per_token": (n_bytes / len(ids)) if ids else 0.0,
            "unique_tokens": len(set(ids)),
        }

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps({"version": 1, "merges": self.merges}), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> "ByteBPETokenizer":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if data.get("version") != 1:
            raise ValueError("unsupported tokenizer format")
        return cls([tuple(m) for m in data["merges"]])
