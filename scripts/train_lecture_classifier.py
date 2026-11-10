#!/usr/bin/env python3
"""Train a small Naive Bayes language classifier on original lecture chunks.

This is a *trained baseline classifier*, not a conversational LLM.
Evaluation splits by lecture week, avoiding chunk-level leakage.
"""
import argparse
from collections import Counter
import json
import math
from pathlib import Path
from lecture_retrieval import load_index

def train(chunks, alpha=1.0):
    labels=("cpp","java")
    counts={label:Counter() for label in labels}
    totals=Counter()
    docs=Counter()
    vocabulary=set()
    from lecture_retrieval import tokenize
    for chunk in chunks:
        label=chunk["language"]
        if label not in labels:
            continue
        words=tokenize(chunk["text"])
        counts[label].update(words)
        totals[label]+=len(words)
        docs[label]+=1
        vocabulary.update(words)
    if not all(docs[label] for label in labels):
        raise ValueError("Need training examples for both languages")
    return {"labels":list(labels),"alpha":alpha,"counts":{k:dict(v) for k,v in counts.items()},
            "totals":dict(totals),"docs":dict(docs),"vocabulary_size":len(vocabulary)}

def predict(model,text):
    from lecture_retrieval import tokenize
    terms=Counter(tokenize(text))
    vocab=model["vocabulary_size"]
    scores={}
    total_docs=sum(model["docs"].values())
    for label in model["labels"]:
        prior=math.log(model["docs"][label]/total_docs)
        denom=model["totals"][label]+model["alpha"]*vocab
        score=prior
        for word,freq in terms.items():
            score+=freq*math.log((model["counts"][label].get(word,0)+model["alpha"])/denom)
        scores[label]=score
    return max(model["labels"],key=lambda label:(scores[label],label))

def evaluate(chunks,holdout_weeks=(1,5)):
    training=[c for c in chunks if c["week"] not in holdout_weeks]
    testing=[c for c in chunks if c["week"] in holdout_weeks]
    if not testing:
        raise ValueError("No held-out lectures found")
    model=train(training)
    correct=sum(predict(model,c["text"])==c["language"] for c in testing)
    return model,{"split":"held-out-lecture-weeks","heldout_weeks":list(holdout_weeks),
                  "train_chunks":len(training),"test_chunks":len(testing),
                  "correct":correct,"accuracy":correct/len(testing)}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--corpus",default="data/original_lessons.jsonl")
    ap.add_argument("--output",default="data/lecture_classifier.json")
    ap.add_argument("--report",default="data/classifier_evaluation.json")
    args=ap.parse_args()
    chunks=load_index(args.corpus).chunks
    model,metrics=evaluate(chunks)
    for path,data in ((args.output,model),(args.report,metrics)):
        p=Path(path);p.parent.mkdir(parents=True,exist_ok=True)
        p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(metrics,ensure_ascii=False))

if __name__=="__main__":
    main()
