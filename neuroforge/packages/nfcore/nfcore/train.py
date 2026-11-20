"""Real training loop: AdamW, warmup + cosine LR, grad clipping, validation.

Every number reported through `on_metric` is measured from actual forward and
backward passes — nothing is simulated.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

import numpy as np
import torch

from .data import get_batch
from .model import GPT


@dataclass
class TrainConfig:
    steps: int = 2000
    batch_size: int = 16
    lr: float = 3e-4
    min_lr: float = 3e-5
    warmup_steps: int = 100
    weight_decay: float = 0.1
    grad_clip: float = 1.0
    eval_interval: int = 100
    eval_iters: int = 20
    ckpt_interval: int = 500
    seed: int = 1337


@dataclass
class MetricEvent:
    step: int
    split: Literal["train", "val"]
    loss: float
    lr: float
    tokens_per_s: float


@dataclass
class TrainResult:
    steps_done: int
    final_train_loss: float
    final_val_loss: float | None
    stopped: bool


class TrainingDiverged(RuntimeError):
    """Raised when the loss becomes NaN or infinite."""


def lr_at(step: int, cfg: TrainConfig) -> float:
    if step < cfg.warmup_steps:
        return cfg.lr * (step + 1) / cfg.warmup_steps
    if step >= cfg.steps:
        return cfg.min_lr
    progress = (step - cfg.warmup_steps) / max(1, cfg.steps - cfg.warmup_steps)
    return cfg.min_lr + 0.5 * (cfg.lr - cfg.min_lr) * (1 + math.cos(math.pi * progress))


@torch.no_grad()
def _evaluate(model: GPT, ids: np.ndarray, cfg: TrainConfig, rng: np.random.Generator) -> float:
    was_training = model.training
    model.eval()
    losses = []
    for _ in range(cfg.eval_iters):
        x, y = get_batch(ids, cfg.batch_size, model.config.context_len, rng)
        losses.append(model(x, y)[1].item())
    model.train(was_training)
    return float(np.mean(losses))


def train(
    model: GPT,
    train_ids: np.ndarray,
    val_ids: np.ndarray,
    cfg: TrainConfig,
    on_metric: Callable[[MetricEvent], None] = lambda e: None,
    on_checkpoint: Callable[[int, float | None], None] = lambda s, v: None,
    should_stop: Callable[[], bool] = lambda: False,
) -> TrainResult:
    torch.manual_seed(cfg.seed)
    rng = np.random.default_rng(cfg.seed)
    eval_rng = np.random.default_rng(cfg.seed + 1)
    decay = [p for p in model.parameters() if p.dim() >= 2]
    no_decay = [p for p in model.parameters() if p.dim() < 2]
    opt = torch.optim.AdamW(
        [{"params": decay, "weight_decay": cfg.weight_decay}, {"params": no_decay, "weight_decay": 0.0}],
        lr=cfg.lr,
        betas=(0.9, 0.95),
    )
    model.train()
    T = model.config.context_len
    train_loss, val_loss = float("nan"), None
    step = 0
    stopped = False
    while step < cfg.steps:
        if should_stop():
            stopped = True
            break
        lr = lr_at(step, cfg)
        for g in opt.param_groups:
            g["lr"] = lr
        t0 = time.perf_counter()
        x, y = get_batch(train_ids, cfg.batch_size, T, rng)
        _, loss, _ = model(x, y)
        if not torch.isfinite(loss):
            raise TrainingDiverged(f"loss became {loss.item()} at step {step}")
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
        opt.step()
        step += 1
        train_loss = loss.item()
        dt = max(time.perf_counter() - t0, 1e-9)
        on_metric(MetricEvent(step, "train", train_loss, lr, cfg.batch_size * T / dt))
        last = step == cfg.steps
        if step % cfg.eval_interval == 0 or last:
            val_loss = _evaluate(model, val_ids, cfg, eval_rng)
            on_metric(MetricEvent(step, "val", val_loss, lr, 0.0))
        if step % cfg.ckpt_interval == 0 or last:
            on_checkpoint(step, val_loss)
    return TrainResult(step, train_loss, val_loss, stopped)
