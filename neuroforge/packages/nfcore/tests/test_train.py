import hashlib

import numpy as np
import pytest
import torch

from nfcore.checkpoint import load_checkpoint, save_checkpoint
from nfcore.model import GPT
from nfcore.train import TrainConfig, TrainingDiverged, lr_at, train

IDS = np.tile(np.arange(20), 40)


def test_lr_schedule():
    c = TrainConfig(steps=100, warmup_steps=10, lr=1e-3, min_lr=1e-4)
    assert lr_at(0, c) == pytest.approx(1e-4)
    assert lr_at(9, c) == pytest.approx(1e-3)
    assert lr_at(100, c) == pytest.approx(1e-4)
    assert lr_at(55, c) == pytest.approx(5.5e-4, rel=1e-3)


def test_overfit_real_learning(C):
    torch.manual_seed(0)
    m = GPT(C)
    ev = []
    cfg = TrainConfig(steps=300, batch_size=8, lr=3e-3, warmup_steps=10,
                      eval_interval=100, eval_iters=2, ckpt_interval=1000)
    train(m, IDS, IDS, cfg, on_metric=ev.append)
    tr = [e.loss for e in ev if e.split == "train"]
    assert tr[-1] < 0.1 * tr[0]
    assert any(e.split == "val" for e in ev)


def test_diverged(C, monkeypatch):
    orig = GPT.forward

    def nan_forward(self, *a, **k):
        lg, loss, tr = orig(self, *a, **k)
        return lg, (loss * float("nan") if loss is not None else None), tr

    monkeypatch.setattr(GPT, "forward", nan_forward)
    with pytest.raises(TrainingDiverged):
        train(GPT(C), IDS, IDS, TrainConfig(steps=5, batch_size=2))


def test_stop(C):
    r = train(GPT(C), IDS, IDS, TrainConfig(steps=1000, ckpt_interval=10**6),
              should_stop=lambda: True)
    assert r.stopped and r.steps_done < 1000


def test_checkpoint_callback(C):
    seen = []
    train(GPT(C), IDS, IDS, TrainConfig(steps=20, batch_size=2, eval_interval=10,
                                         eval_iters=1, ckpt_interval=10),
          on_checkpoint=lambda s, v: seen.append(s))
    assert seen == [10, 20]


def test_checkpoint_roundtrip(C, tmp_path):
    m = GPT(C).eval()
    sha = save_checkpoint(tmp_path / "c.pt", m, C, 5, "fp", {})
    m2, meta = load_checkpoint(tmp_path / "c.pt", "fp")
    x = torch.randint(0, 300, (1, 8))
    assert torch.allclose(m(x)[0], m2(x)[0])
    assert sha == hashlib.sha256((tmp_path / "c.pt").read_bytes()).hexdigest()
    assert meta["meta"]["label"] == "оқу моделі"
    assert meta["meta"]["params_count"] == C.params_count()


def test_checkpoint_tokenizer_mismatch(C, tmp_path):
    save_checkpoint(tmp_path / "c.pt", GPT(C), C, 1, "a", {})
    with pytest.raises(ValueError):
        load_checkpoint(tmp_path / "c.pt", "b")
