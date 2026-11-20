import pytest
import torch

from nfcore.config import GPTConfig
from nfcore.model import GPT


def test_params_formula(C):
    m = GPT(C)
    assert C.params_count() == sum(p.numel() for p in m.parameters())


def test_default_params_range():
    assert 6_000_000 < GPTConfig().params_count() < 8_000_000


def test_bad_heads():
    with pytest.raises(ValueError):
        GPTConfig(d_model=30, n_heads=4)


def test_shapes_and_loss(C):
    m = GPT(C)
    x = torch.randint(0, 300, (2, 10))
    lg, loss, _ = m(x, x)
    assert lg.shape == (2, 10, 300) and loss.ndim == 0


def test_causal(C):
    torch.manual_seed(0)
    m = GPT(C).eval()
    x = torch.randint(0, 300, (1, 10))
    y = x.clone()
    y[0, 7:] = (y[0, 7:] + 1) % 300
    assert torch.allclose(m(x)[0][0, :7], m(y)[0][0, :7], atol=1e-6)


def test_trace(C):
    m = GPT(C).eval()
    _, _, tr = m(torch.randint(0, 300, (1, 6)), capture=True)
    a = tr.attn[0]
    assert len(tr.attn) == 2 and a.shape == (1, 4, 6, 6)
    assert torch.allclose(a.sum(-1), torch.ones(1, 4, 6), atol=1e-5)
    assert torch.all(torch.triu(a[0, 0], 1) == 0)
    assert len(tr.residual) == 3


def test_too_long(C):
    m = GPT(C)
    with pytest.raises(ValueError):
        m(torch.zeros(1, 33, dtype=torch.long))
