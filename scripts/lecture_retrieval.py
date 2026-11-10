#!/usr/bin/env python3
"""Grounded, dependency-free lecture retrieval. No generative accuracy claims."""
import argparse
from collections import Counter
import json
import math
from pathlib import Path
import re

TOKENS = re.compile(r"[\w+#.]+", re.UNICODE)

def tokenize(text):
    return TOKENS.findall(text.casefold())

def chunk_lesson(doc, max_words=180, overlap=30):
    words = doc["text"].split()
    if not 0 <= overlap < max_words:
        raise ValueError("Invalid overlap")
    step = max_words - overlap
    for i, start in enumerate(range(0, len(words), step)):
        chunk = words[start:start + max_words]
        if not chunk:
            continue
        yield {"id": f'{doc["id"]}#{i}', "source": doc["id"],
               "language": doc["language"], "week": doc["week"],
               "text": " ".join(chunk)}
        if start + max_words >= len(words):
            break

class LectureIndex:
    def __init__(self, chunks):
        self.chunks = list(chunks)
        self.counts = [Counter(tokenize(c["text"])) for c in self.chunks]
        self.lengths = [sum(c.values()) for c in self.counts]
        self.avg_length = sum(self.lengths) / max(1, len(self.lengths))
        self.df = Counter()
        for counts in self.counts:
            self.df.update(counts.keys())

    def search(self, query, language=None, limit=5):
        terms = set(tokenize(query))
        if not terms or not self.chunks:
            return []
        n = len(self.chunks)
        results = []
        for idx, counts in enumerate(self.counts):
            chunk = self.chunks[idx]
            if language and chunk["language"] != language:
                continue
            score = 0.0
            for term in terms:
                freq = counts[term]
                if not freq:
                    continue
                idf = math.log(1 + (n - self.df[term] + 0.5) / (self.df[term] + 0.5))
                score += idf * (freq * 2.2) / (freq + 1.2 * (0.25 + 0.75 * self.lengths[idx] / max(self.avg_length, 1)))
            if score > 0:
                results.append({"score": round(score, 6), **chunk})
        return sorted(results, key=lambda x: (-x["score"], x["id"]))[:max(0, limit)]

def load_index(path):
    docs = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
    ids = [doc["id"] for doc in docs]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate source IDs")
    return LectureIndex(chunk for doc in docs for chunk in chunk_lesson(doc))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="data/original_lessons.jsonl")
    ap.add_argument("--query", required=True)
    ap.add_argument("--language", choices=["cpp", "java"])
    ap.add_argument("--limit", type=int, default=5)
    args = ap.parse_args()
    index = load_index(args.corpus)
    print(json.dumps(index.search(args.query, args.language, args.limit), ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
