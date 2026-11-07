#!/usr/bin/env python3
"""Run the genuinely trained full-lecture Naive Bayes baseline.

The committed model was fitted to 12 original C++/Java lecture HTML files,
holding out weeks 1 and 5 from each language. This is a classifier only.
"""
import argparse
import json
import math
from pathlib import Path
import re

def classify(model, text):
    terms=re.findall(r"[\w+#.]{2,}",text.lower())
    if not terms:
        return {"status":"unknown","reason":"No query tokens"}
    counts=model["counts"]
    vocab=set(counts["cpp"])|set(counts["java"])
    seen=[term for term in terms if term in vocab]
    if not seen:
        return {"status":"unknown","reason":"No trained vocabulary overlap"}
    scores={}
    for label in model["labels"]:
        denominator=model["totals"][label]+model["vocabulary_size"]
        scores[label]=sum(math.log((counts[label].get(word,0)+1)/denominator) for word in seen)
    label=max(model["labels"],key=lambda x:scores[x])
    return {"status":"classified","language":label,
            "known_tokens":len(seen),"total_tokens":len(terms),
            "warning":"Language routing only; not a code-solving model"}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--model",default="models/original_lecture_nb.json")
    ap.add_argument("--question",required=True)
    args=ap.parse_args()
    model=json.loads(Path(args.model).read_text(encoding="utf-8"))
    print(json.dumps(classify(model,args.question),ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
