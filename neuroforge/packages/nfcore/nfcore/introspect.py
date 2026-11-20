"""Introspection: one forward pass, real tensors, JSON-ready for 3D lessons.

Nothing here is simulated. Embedding coordinates are a fixed PCA projection of
the model's own embedding matrix (fitted once per checkpoint), so the same token
always lands at the same place in the scene.
"""

from __future__ import annotations

import codecs
from dataclasses import dataclass

import torch

from .checkpoint import MODEL_LABEL, MODEL_NAME
from .model import GPT
from .tokenizer import ByteBPETokenizer

MAX_INTROSPECT_TOKENS = 32


@dataclass
class PCA3:
    mean: list[float]
    components: list[list[float]]

    def project(self, x: torch.Tensor) -> torch.Tensor:
        mean = torch.tensor(self.mean, dtype=x.dtype)
        comps = torch.tensor(self.components, dtype=x.dtype)
        return (x - mean) @ comps.T

    def to_dict(self) -> dict:
        return {"mean": self.mean, "components": self.components}

    @classmethod
    def from_dict(cls, data: dict) -> "PCA3":
        return cls(mean=data["mean"], components=data["components"])


def fit_pca3(weight: torch.Tensor) -> PCA3:
    w = weight.detach().double()
    mean = w.mean(dim=0)
    _, _, vh = torch.linalg.svd(w - mean, full_matrices=False)
    comps = vh[:3].clone()
    for i in range(comps.shape[0]):  # deterministic sign: largest |value| is positive
        if comps[i, comps[i].abs().argmax()] < 0:
            comps[i] = -comps[i]
    return PCA3(mean=mean.float().tolist(), components=comps.float().tolist())


def _r(t: torch.Tensor) -> list:
    return torch.round(t.float(), decimals=4).tolist()


def _token_texts(tok: ByteBPETokenizer, ids: list[int]) -> list[str]:
    """Per-token text whose concatenation is exactly the decoded string.

    A token may end in the middle of a multi-byte UTF-8 character; its
    incomplete bytes are carried into the next token's text.
    """
    dec = codecs.getincrementaldecoder("utf-8")(errors="replace")
    out = [dec.decode(tok.token_bytes(i), final=False) for i in ids]
    if out:
        out[-1] += dec.decode(b"", final=True)
    return out


@torch.no_grad()
def introspect(model: GPT, tok: ByteBPETokenizer, text: str, pca: PCA3, top_k: int = 10) -> dict:
    if not text.strip():
        raise ValueError("empty input")
    ids = tok.encode(text)
    limit = min(MAX_INTROSPECT_TOKENS, model.config.context_len)
    if len(ids) > limit:
        raise ValueError(f"input too long: {len(ids)} tokens > {limit}")
    cfg = model.config
    was_training = model.training
    model.eval()
    _, _, tr = model(torch.tensor([ids], dtype=torch.long), capture=True)
    model.train(was_training)

    T = len(ids)
    layers = []
    for li in range(cfg.n_layers):
        layers.append(
            {
                "attention": _r(tr.attn[li][0]),
                "q_norm": _r(tr.q[li][0].norm(dim=-1)),
                "k_norm": _r(tr.k[li][0].norm(dim=-1)),
                "v_norm": _r(tr.v[li][0].norm(dim=-1)),
                "residual_norm": _r(tr.residual[li + 1][0].norm(dim=-1)),
            }
        )
    probs = torch.softmax(tr.final_logits[0, -1], dim=-1)
    top = torch.topk(probs, min(top_k, probs.numel()))
    texts = _token_texts(tok, ids)
    return {
        "model": {
            "name": MODEL_NAME,
            "label": MODEL_LABEL,
            "params_count": cfg.params_count(),
            "config": cfg.to_dict(),
        },
        "tokens": [
            {"id": i, "text": t, "bytes_hex": tok.token_bytes(i).hex()} for i, t in zip(ids, texts)
        ],
        "embeddings3d": _r(pca.project(tr.tok_emb[0])),
        "positions3d": _r(pca.project(tr.pos_emb)),
        "residual_norm_in": _r(tr.residual[0][0].norm(dim=-1)),
        "layers": layers,
        "next_token": [
            {"id": int(i), "text": tok.token_str(int(i)), "prob": round(float(p), 6)}
            for p, i in zip(top.values, top.indices)
        ],
        "shapes": {
            "tokens": [T],
            "embedding": [T, cfg.d_model],
            "qkv_per_head": [cfg.n_heads, T, cfg.head_dim],
            "attention": [cfg.n_heads, T, T],
            "mlp_hidden": [T, cfg.d_model * cfg.mlp_ratio],
            "logits": [cfg.vocab_size],
        },
    }
