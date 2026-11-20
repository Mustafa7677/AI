import json

import numpy as np
import pytest
import torch

from nfcore.introspect import fit_pca3, introspect


def test_introspect_shapes(tiny):
    m, tok, pca = tiny
    r = introspect(m, tok, "Сәлем әлем", pca, top_k=5)
    T = len(r["tokens"])
    assert len(r["layers"]) == 2
    assert len(r["layers"][0]["attention"]) == 4
    assert len(r["layers"][0]["attention"][0]) == T
    assert len(r["embeddings3d"]) == T and len(r["embeddings3d"][0]) == 3
    assert r["shapes"]["attention"] == [4, T, T]
    assert r["model"]["label"] == "оқу моделі"
    json.dumps(r)


def test_attention_rows_sum_and_causal(tiny):
    m, tok, pca = tiny
    a = np.array(introspect(m, tok, "Сәлем әлем", pca)["layers"][1]["attention"])
    assert np.allclose(a.sum(-1), 1, atol=1e-3)
    assert np.all(np.triu(a, 1) == 0)


def test_next_token_sorted(tiny):
    m, tok, pca = tiny
    r = introspect(m, tok, "Сәлем", pca, top_k=5)
    p = [x["prob"] for x in r["next_token"]]
    assert p == sorted(p, reverse=True) and 0 < sum(p) <= 1.0001 and len(p) == 5


def test_empty(tiny):
    m, tok, pca = tiny
    with pytest.raises(ValueError, match="empty input"):
        introspect(m, tok, "   ", pca)


def test_too_long(tiny):
    m, tok, pca = tiny
    with pytest.raises(ValueError, match="input too long"):
        introspect(m, tok, "сөз " * 40, pca)


def test_pca_stable():
    w = torch.randn(50, 16)
    assert fit_pca3(w) == fit_pca3(w.clone())


def test_tokens_text_concat(tiny):
    m, tok, pca = tiny
    r = introspect(m, tok, "Қазақ тілі 🚀", pca)
    assert "".join(t["text"] for t in r["tokens"]) == "Қазақ тілі 🚀"
