import pytest

SMALL = dict(vocab_size=300, context_len=32, d_model=32, n_layers=2, n_heads=4)


@pytest.fixture
def C():
    from nfcore.config import GPTConfig

    return GPTConfig(**SMALL)


@pytest.fixture
def tiny():
    import torch

    from nfcore.config import GPTConfig
    from nfcore.introspect import fit_pca3
    from nfcore.model import GPT
    from nfcore.tokenizer import ByteBPETokenizer

    tok = ByteBPETokenizer()
    tok.train("Сәлем әлем. Қазақ тілі — бай тіл. " * 30, 300)
    torch.manual_seed(0)
    m = GPT(GPTConfig(**SMALL)).eval()
    return m, tok, fit_pca3(m.tok_emb.weight.detach())
