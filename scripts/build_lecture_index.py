#!/usr/bin/env python3
"""Train a small, auditable TF-IDF lecture search index (no neural-training claim)."""
import argparse
from collections import Counter
import json
import math
from pathlib import Path
from lecture_retrieval import load_index, tokenize

def build(corpus):
    index = load_index(corpus)
    n = len(index.chunks)
    df = index.df
    vectors = []
    for chunk, counts in zip(index.chunks, index.counts):
        weights = {term: (1 + math.log(freq)) * math.log((n + 1) / (df[term] + 1))
                   for term, freq in counts.items()}
        norm = math.sqrt(sum(v*v for v in weights.values())) or 1.0
        vectors.append({"id":chunk["id"],"source":chunk["source"],"language":chunk["language"],
                        "week":chunk["week"],"text":chunk["text"],
                        "weights":{k:round(v/norm,8) for k,v in weights.items() if v > 0}})
    return {"format":"tulpar-tfidf-v1","documents":n,"vectors":vectors}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--corpus",default="data/original_lessons.jsonl")
    ap.add_argument("--output",default="data/lecture_index.json")
    args=ap.parse_args()
    result=build(args.corpus)
    out=Path(args.output)
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,ensure_ascii=False),encoding="utf-8")
    print(f"Indexed {result['documents']} chunks to {out}")

if __name__=="__main__":
    main()
