#!/usr/bin/env python3
"""Run the trained TULPAR neural language classifier on a question.

Inference is limited to C++/Java routing; it does not generate code or answers.
Only load checkpoints produced by trusted TULPAR workflows.
"""
import argparse
import json
from pathlib import Path
from lecture_retrieval import tokenize

def predict(checkpoint_path, question):
    import torch
    from torch import nn
    checkpoint=torch.load(checkpoint_path,map_location="cpu",weights_only=True)
    vocab=checkpoint["vocabulary"]
    embedding=nn.Embedding(len(vocab)+1,48,padding_idx=0)
    net=nn.Sequential(nn.Linear(48,64),nn.ReLU(),nn.Linear(64,2))
    embedding.load_state_dict({k.removeprefix("embedding."):v for k,v in checkpoint["state_dict"].items() if k.startswith("embedding.")})
    net.load_state_dict({k.removeprefix("net."):v for k,v in checkpoint["state_dict"].items() if k.startswith("net.")})
    ids=[vocab[w] for w in tokenize(question) if w in vocab][:256]
    if not ids:
        return {"status":"unknown","reason":"No vocabulary overlap; abstaining"}
    x=torch.tensor([ids],dtype=torch.long)
    with torch.no_grad():
        pooled=embedding(x).mean(dim=1)
        logits=net(pooled)
        probabilities=torch.softmax(logits,dim=1)[0]
    best=int(probabilities.argmax())
    return {"status":"classified","language":["cpp","java"][best],
            "confidence":round(float(probabilities[best]),4),
            "warning":"Confidence is uncalibrated; this is not a code-answer quality score"}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--checkpoint",default="data/tulpar_neural_classifier.pt")
    ap.add_argument("--question",required=True)
    args=ap.parse_args()
    print(json.dumps(predict(Path(args.checkpoint),args.question),ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
