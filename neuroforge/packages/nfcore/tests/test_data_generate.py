import numpy as np
import pytest
import torch

from nfcore.data import get_batch, split_ids
from nfcore.generate import generate
from nfcore.model import GPT


def test_split():
    tr, va = split_ids(np.arange(100))
    assert len(va) == 10 and tr[-1] == 89 and va[0] == 90


def test_batch_shift():
    x, y = get_batch(np.arange(50), 4, 8, np.random.default_rng(0))
    assert x.shape == (4, 8) and torch.equal(x[:, 1:], y[:, :-1])


def test_batch_short():
    with pytest.raises(ValueError):
        get_batch(np.arange(5), 1, 8, np.random.default_rng(0))


def test_greedy_deterministic(C):
    m = GPT(C).eval()
    a = list(generate(m, [1, 2, 3], 5, temperature=0))
    b = list(generate(m, [1, 2, 3], 5, temperature=0))
    assert a == b and len(a) == 5


def test_seeded_sampling(C):
    m = GPT(C).eval()
    assert list(generate(m, [1], 8, seed=7)) == list(generate(m, [1], 8, seed=7))


def test_long_context_window(C):
    m = GPT(C).eval()
    assert len(list(generate(m, list(range(40)), 3, temperature=0))) == 3
