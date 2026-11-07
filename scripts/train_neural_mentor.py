#!/usr/bin/env python3
"""Train an actual neural classifier on original lecture chunks with PyTorch.

Scope: classify C++ vs Java passages. This is not an LLM, and its accuracy
must never be presented as general programming-answer accuracy.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import random
import sys

from lecture_retrieval import load_index, tokenize

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--corpus",default="data/original_lessons.jsonl")
    ap.add_argument("--output",default="data/tulpar_neural_classifier.pt")
    ap.add_argument("--metrics",default="data/neural_metrics.json")
    ap.add_argument("--epochs",type=int,default=30)
    ap.add_argument("--seed",type=int,default=42)
    args=ap.parse_args()
    try:
        import torch
        from torch import nn
    except ImportError:
        sys.exit("Install PyTorch first: pip install torch")
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(2)
    chunks=load_index(args.corpus).chunks
    train=[c for c in chunks if c["week"] not in (1,5)]
    test=[c for c in chunks if c["week"] in (1,5)]
    if not train or not test:
        raise ValueError("Both training and held-out lectures are required")
    vocab=Counter(w for c in train for w in tokenize(c["text"]))
    words=[w for w,n in sorted(vocab.items(),key=lambda p:(-p[1],p[0])) if n>=2][:12000]
    word_to_id={w:i+1 for i,w in enumerate(words)}
    def vectorize(c):
        ids=[word_to_id[w] for w in tokenize(c["text"]) if w in word_to_id][:256]
        return ids or [0]
    def batch(rows):
        x=torch.zeros((len(rows),256),dtype=torch.long)
        for i,c in enumerate(rows):
            ids=vectorize(c)
            x[i,:len(ids)]=torch.tensor(ids)
        y=torch.tensor([0 if c["language"]=="cpp" else 1 for c in rows],dtype=torch.long)
        return x,y
    x_train,y_train=batch(train)
    x_test,y_test=batch(test)
    class Classifier(nn.Module):
        def __init__(self):
            super().__init__()
            self.embedding=nn.Embedding(len(word_to_id)+1,48,padding_idx=0)
            self.net=nn.Sequential(nn.Linear(48,64),nn.ReLU(),nn.Linear(64,2))
        def forward(self,x):
            embeddings=self.embedding(x)
            mask=(x!=0).unsqueeze(-1)
            pooled=(embeddings*mask).sum(dim=1)/mask.sum(dim=1).clamp(min=1)
            return self.net(pooled)
    model=Classifier()
    optimizer=torch.optim.AdamW(model.parameters(),lr=0.004)
    loss_fn=nn.CrossEntropyLoss()
    for epoch in range(args.epochs):
        model.train()
        order=torch.randperm(len(train))
        for ix in order.split(32):
            logits=model(x_train[ix])
            loss=loss_fn(logits,y_train[ix])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
    model.eval()
    with torch.no_grad():
        predicted=model(x_test).argmax(dim=1)
    correct=int((predicted==y_test).sum().item())
    metrics={"task":"C++ vs Java passage classification ONLY",
             "split":"held-out weeks 1 and 5, no test-vocabulary training",
             "seed":args.seed,"epochs":args.epochs,
             "train_chunks":len(train),"test_chunks":len(test),
             "correct":correct,"accuracy":correct/len(test),
             "model_parameters":sum(p.numel() for p in model.parameters())}
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    torch.save({"state_dict":model.state_dict(),"vocabulary":word_to_id,
                "architecture":"mean-embedding-48-mlp-64-2","metrics":metrics},output)
    report=Path(args.metrics);report.parent.mkdir(parents=True,exist_ok=True)
    report.write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(metrics,ensure_ascii=False))
if __name__=="__main__":
    main()
