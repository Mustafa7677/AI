"""Test neural inference against an in-memory trained checkpoint.

This verifies serialization and inference wiring, not model capability.
"""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from neural_inference import predict

class NeuralInferenceTests(unittest.TestCase):
    def test_checkpoint_roundtrip(self):
        try:
            import torch
            from torch import nn
        except ImportError:
            self.skipTest("PyTorch not installed")
        class Classifier(nn.Module):
            def __init__(self):
                super().__init__()
                self.embedding=nn.Embedding(3,48,padding_idx=0)
                self.net=nn.Sequential(nn.Linear(48,64),nn.ReLU(),nn.Linear(64,2))
            def forward(self,x):
                return self.net(self.embedding(x).mean(dim=1))
        model=Classifier()
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"weights.pt"
            torch.save({"state_dict":model.state_dict(),
                        "vocabulary":{"cpp":1,"java":2}},path)
            result=predict(path,"cpp")
            self.assertEqual(result["status"],"classified")
            self.assertIn(result["language"],("cpp","java"))
            self.assertEqual(predict(path,"unknownterm")["status"],"unknown")

if __name__=="__main__":
    unittest.main()
