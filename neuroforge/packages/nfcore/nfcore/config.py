"""GPT model configuration and exact parameter count."""

from __future__ import annotations

from dataclasses import asdict, dataclass, fields


@dataclass
class GPTConfig:
    vocab_size: int = 8000
    context_len: int = 256
    d_model: int = 256
    n_layers: int = 6
    n_heads: int = 8
    mlp_ratio: int = 4
    dropout: float = 0.0

    def __post_init__(self) -> None:
        if self.d_model % self.n_heads:
            raise ValueError(f"d_model ({self.d_model}) must be divisible by n_heads ({self.n_heads})")
        for name in ("vocab_size", "context_len", "d_model", "n_layers", "n_heads", "mlp_ratio"):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} must be positive")

    @property
    def head_dim(self) -> int:
        return self.d_model // self.n_heads

    def params_count(self) -> int:
        """Exact number of trainable parameters (tied input/output embeddings)."""
        d, m = self.d_model, self.d_model * self.mlp_ratio
        per_layer = (
            2 * 2 * d  # two LayerNorms (weight + bias)
            + (3 * d * d + 3 * d)  # fused Q, K, V projection
            + (d * d + d)  # attention output projection
            + (d * m + m)  # MLP up
            + (m * d + d)  # MLP down
        )
        return self.vocab_size * d + self.context_len * d + self.n_layers * per_layer + 2 * d

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "GPTConfig":
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in names})
