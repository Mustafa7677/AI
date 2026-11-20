def test_package_imports_and_torch_works():
    import nfcore
    import torch

    assert nfcore.__version__ == "0.1.0"
    assert torch.ones(2).sum().item() == 2
