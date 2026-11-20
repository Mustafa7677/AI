"""Autoregressive sampling from a GPT."""

from __future__ import annotations

from collections.abc import Iterator

import torch

from .model import GPT


@torch.no_grad()
def generate(
    model: GPT,
    ids: list[int],
    max_new_tokens: int,
    temperature: float = 1.0,
    top_k: int | None = None,
    seed: int | None = None,
) -> Iterator[int]:
    if not ids:
        raise ValueError("generate needs at least one prompt token")
    gen = torch.Generator()
    if seed is not None:
        gen.manual_seed(seed)
    ctx = list(ids)
    window = model.config.context_len
    for _ in range(max_new_tokens):
        x = torch.tensor([ctx[-window:]], dtype=torch.long)
        logits = model(x)[0][0, -1]
        if temperature == 0:
            nxt = int(torch.argmax(logits))
        else:
            logits = logits / temperature
            if top_k is not None:
                kth = torch.topk(logits, min(top_k, logits.numel())).values[-1]
                logits = logits.masked_fill(logits < kth, float("-inf"))
            probs = torch.softmax(logits, dim=-1)
            nxt = int(torch.multinomial(probs, 1, generator=gen))
        ctx.append(nxt)
        yield nxt
