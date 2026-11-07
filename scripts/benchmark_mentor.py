#!/usr/bin/env python3
"""Evaluate TULPAR retrieval on independent Kazakh student questions.

Reports retrieval recall and language leakage. No claims about correctness of
generated explanations or competitiveness with frontier AI systems.
"""
import argparse
import json
from pathlib import Path
import sys
from lecture_retrieval import load_index

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tests"))
from mentor_benchmark_cases import CASES

def evaluate(index):
    records=[]
    for case in CASES:
        hits=index.search(case["question"],language=case["language"],limit=5)
        joined=" ".join(h["text"] for h in hits).casefold()
        term_matches=sum(term.casefold() in joined for term in case["terms"])
        records.append({"id":case["id"],"language":case["language"],
                        "retrieved":bool(hits),"terms_covered":term_matches,
                        "total_terms":len(case["terms"]),
                        "source_ids":[h["source"] for h in hits]})
    return {"benchmark":"independent authored Kazakh programming questions",
            "count":len(records),
            "retrieval_hit_rate":sum(r["retrieved"] for r in records)/len(records),
            "term_coverage":sum(r["terms_covered"] for r in records)/sum(r["total_terms"] for r in records),
            "records":records}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--corpus",default="data/original_lessons.jsonl")
    ap.add_argument("--output",default="data/mentor_benchmark.json")
    args=ap.parse_args()
    result=evaluate(load_index(args.corpus))
    out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({k:v for k,v in result.items() if k!="records"},ensure_ascii=False))

if __name__=="__main__":
    main()
