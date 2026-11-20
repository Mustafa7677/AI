"""Checkpoint save/load with integrity hash and tokenizer binding."""

from __future__ import annotations

import hashlib
from pathlib import Path

import torch

from .config import GPTConfig
from .model import GPT

FORMAT = "nfcore-ckpt-1"
MODEL_NAME = "nf-edu-kk-v1"
MODEL_LABEL = "оқу моделі"


def save_checkpoint(
    path: str | Path, model: GPT, config: GPTConfig, step: int, tokenizer_fp: str, extra: dict
) -> str:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "format": FORMAT,
        "model": model.state_dict(),
        "config": config.to_dict(),
        "step": step,
        "tokenizer_fp": tokenizer_fp,
        "meta": {"name": MODEL_NAME, "label": MODEL_LABEL, "params_count": config.params_count(), **extra},
    }
    tmp = path.with_suffix(path.suffix + ".tmp")
    torch.save(payload, tmp)
    tmp.replace(path)  # atomic: readers never see a half-written checkpoint
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_checkpoint(path: str | Path, expected_tokenizer_fp: str | None = None) -> tuple[GPT, dict]:
    payload = torch.load(Path(path), map_location="cpu", weights_only=True)
    if payload.get("format") != FORMAT:
        raise ValueError("unsupported checkpoint format")
    if expected_tokenizer_fp is not None and payload["tokenizer_fp"] != expected_tokenizer_fp:
        raise ValueError("tokenizer mismatch: checkpoint was trained with a different tokenizer")
    model = GPT(GPTConfig.from_dict(payload["config"]))
    model.load_state_dict(payload["model"])
    model.eval()
    meta = {k: v for k, v in payload.items() if k != "model"}
    return model, meta
