"""Decoder-only GPT with an optional forward trace for visualization.

Attention is computed explicitly (scores -> causal mask -> softmax -> weighted
values) instead of a fused kernel, so that the real attention weights can be
captured and shown in lessons.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import torch
import torch.nn as nn
import torch.nn.functional as F

from .config import GPTConfig


@dataclass
class ForwardTrace:
    tok_emb: torch.Tensor
    pos_emb: torch.Tensor
    q: list[torch.Tensor] = field(default_factory=list)
    k: list[torch.Tensor] = field(default_factory=list)
    v: list[torch.Tensor] = field(default_factory=list)
    attn: list[torch.Tensor] = field(default_factory=list)
    residual: list[torch.Tensor] = field(default_factory=list)
    final_logits: torch.Tensor | None = None


class CausalSelfAttention(nn.Module):
    def __init__(self, cfg: GPTConfig) -> None:
        super().__init__()
        self.n_heads = cfg.n_heads
        self.head_dim = cfg.head_dim
        self.qkv = nn.Linear(cfg.d_model, 3 * cfg.d_model)
        self.proj = nn.Linear(cfg.d_model, cfg.d_model)
        self.drop = nn.Dropout(cfg.dropout)

    def forward(self, x: torch.Tensor, trace: ForwardTrace | None) -> torch.Tensor:
        B, T, D = x.shape
        q, k, v = self.qkv(x).split(D, dim=-1)
        # [B, T, D] -> [B, H, T, dh]
        q, k, v = (t.view(B, T, self.n_heads, self.head_dim).transpose(1, 2) for t in (q, k, v))
        scores = (q @ k.transpose(-2, -1)) / math.sqrt(self.head_dim)
        mask = torch.triu(torch.ones(T, T, dtype=torch.bool, device=x.device), diagonal=1)
        weights = F.softmax(scores.masked_fill(mask, float("-inf")), dim=-1)
        if trace is not None:
            trace.q.append(q.detach())
            trace.k.append(k.detach())
            trace.v.append(v.detach())
            trace.attn.append(weights.detach())
        out = (self.drop(weights) @ v).transpose(1, 2).contiguous().view(B, T, D)
        return self.proj(out)


class Block(nn.Module):
    def __init__(self, cfg: GPTConfig) -> None:
        super().__init__()
        hidden = cfg.d_model * cfg.mlp_ratio
        self.ln1 = nn.LayerNorm(cfg.d_model)
        self.attn = CausalSelfAttention(cfg)
        self.ln2 = nn.LayerNorm(cfg.d_model)
        self.mlp = nn.Sequential(
            nn.Linear(cfg.d_model, hidden), nn.GELU(), nn.Linear(hidden, cfg.d_model), nn.Dropout(cfg.dropout)
        )

    def forward(self, x: torch.Tensor, trace: ForwardTrace | None) -> torch.Tensor:
        x = x + self.attn(self.ln1(x), trace)
        return x + self.mlp(self.ln2(x))


class GPT(nn.Module):
    def __init__(self, config: GPTConfig) -> None:
        super().__init__()
        self.config = config
        self.tok_emb = nn.Embedding(config.vocab_size, config.d_model)
        self.pos_emb = nn.Embedding(config.context_len, config.d_model)
        self.drop = nn.Dropout(config.dropout)
        self.blocks = nn.ModuleList(Block(config) for _ in range(config.n_layers))
        self.ln_f = nn.LayerNorm(config.d_model)
        self.apply(self._init)

    @staticmethod
    def _init(mod: nn.Module) -> None:
        if isinstance(mod, (nn.Linear, nn.Embedding)):
            nn.init.normal_(mod.weight, mean=0.0, std=0.02)
            if isinstance(mod, nn.Linear) and mod.bias is not None:
                nn.init.zeros_(mod.bias)

    def forward(
        self, idx: torch.Tensor, targets: torch.Tensor | None = None, capture: bool = False
    ) -> tuple[torch.Tensor, torch.Tensor | None, ForwardTrace | None]:
        B, T = idx.shape
        if T > self.config.context_len:
            raise ValueError(f"sequence length {T} exceeds context_len {self.config.context_len}")
        pos = torch.arange(T, device=idx.device)
        tok, pe = self.tok_emb(idx), self.pos_emb(pos)
        trace = ForwardTrace(tok_emb=tok.detach(), pos_emb=pe.detach()) if capture else None
        x = self.drop(tok + pe)
        if trace is not None:
            trace.residual.append(x.detach())
        for block in self.blocks:
            x = block(x, trace)
            if trace is not None:
                trace.residual.append(x.detach())
        logits = self.ln_f(x) @ self.tok_emb.weight.T  # tied output head
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
        if trace is not None:
            trace.final_logits = logits.detach()
        return logits, loss, trace
