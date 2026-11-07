#!/usr/bin/env python3
"""Run reproducible retrieval diagnostics against original lecture corpus.

Queries are generated from held-out terms inside each source. This is a lexical
self-retrieval sanity check, NOT independent student-question performance.
"""
import argparse
import json
from pathlib import Path
from lecture_retrieval import load_index, tokenize

def evaluate(index):
    cases=[]
    for chunk in index.chunks:
        terms=[t for t in tokenize(chunk["text"]) if len(t)>5]
        unique=list(dict.fromkeys(terms))
        if len(unique)<2:
            continue
        query=" ".join(unique[:min(5,len(unique))])
        hits=index.search(query,language=chunk["language"],limit=5)
        cases.append({"source":chunk["source"],"query":query,
                      "found":any(hit["source"]==chunk["source"] for hit in hits)})
    return {"evaluation":"lexical self-retrieval; NOT held-out questions",
            "cases":len(cases),"hits":sum(x["found"] for x in cases),
            "recall_at_5":sum(x["found"] for x in cases)/len(cases) if cases else None}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--corpus",default="data/original_lessons.jsonl")
    ap.add_argument("--output",default="data/retrieval_diagnostics.json")
    args=ap.parse_args()
    result=evaluate(load_index(args.corpus))
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(result,ensure_ascii=False))
if __name__=="__main__":
    main()
