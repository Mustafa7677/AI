"""Token-id datasets: contiguous train/val split and random next-token batches."""

from __future__ import annotations

import numpy as np
import torch


def split_ids(ids: np.ndarray, val_frac: float = 0.1) -> tuple[np.ndarray, np.ndarray]:
    """Last `val_frac` of the stream is validation; no shuffling, so no leakage."""
    if not 0 < val_frac < 1:
        raise ValueError("val_frac must be in (0, 1)")
    n_val = max(1, int(round(len(ids) * val_frac)))
    return ids[:-n_val], ids[-n_val:]


def get_batch(
    ids: np.ndarray, batch_size: int, context_len: int, rng: np.random.Generator
) -> tuple[torch.Tensor, torch.Tensor]:
    if len(ids) <= context_len:
        raise ValueError(f"need more than {context_len} tokens, got {len(ids)}")
    starts = rng.integers(0, len(ids) - context_len, size=batch_size)
    x = np.stack([ids[s : s + context_len] for s in starts])
    y = np.stack([ids[s + 1 : s + 1 + context_len] for s in starts])
    return torch.from_numpy(x.astype(np.int64)), torch.from_numpy(y.astype(np.int64))
