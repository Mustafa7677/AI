"""Offline, source-grounded answer assembly for TULPAR.

Returns relevant excerpts with citations; never invents a lecture answer.
"""
import argparse
import json
from lecture_retrieval import load_index
from multilingual_queries import expand

def answer(index, question, language=None, limit=3, min_score=0.05):
    hits=index.search(expand(question), language=language, limit=limit)
    hits=[h for h in hits if h["score"]>=min_score]
    if not hits:
        return {"status":"not_found","answer":"Бұл сұраққа авторлық дәрістерден сенімді дерек табылмады.","citations":[]}
    citations=[{"source":h["source"],"chunk_id":h["id"],"score":h["score"]} for h in hits]
    excerpts="\n\n".join(
        f"[{i}] {hit['text'][:650]}\nДереккөз: {hit['source']}"
        for i,hit in enumerate(hits,1)
    )
    return {"status":"retrieved","answer":excerpts,"citations":citations}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--corpus",default="data/original_lessons.jsonl")
    ap.add_argument("--question",required=True)
    ap.add_argument("--language",choices=["cpp","java"])
    args=ap.parse_args()
    result=answer(load_index(args.corpus),args.question,args.language)
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
