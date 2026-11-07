#!/usr/bin/env python3
"""Extract only original C++/Java lecture content for TULPAR retrieval training.

Usage:
  python scripts/prepare_original_lessons.py ../CS50MUSS --output data/original_lessons.jsonl

Requires a local checkout of the author's CS50MUSS repository.
Does not train or download third-party translations.
"""
import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re

class Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.chunks = []
    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "svg", "nav", "footer"}:
            self.skip += 1
        if tag in {"h1", "h2", "h3", "p", "li", "pre", "code"} and not self.skip:
            self.chunks.append("\n")
    def handle_endtag(self, tag):
        if tag in {"script", "style", "svg", "nav", "footer"} and self.skip:
            self.skip -= 1
        if tag in {"h1", "h2", "h3", "p", "li", "pre"} and not self.skip:
            self.chunks.append("\n")
    def handle_data(self, data):
        if not self.skip:
            self.chunks.append(data)

def extract(raw):
    parser = Extractor()
    parser.feed(raw)
    text = html.unescape("".join(parser.chunks))
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("repository", type=Path)
    ap.add_argument("--output", type=Path, default=Path("data/original_lessons.jsonl"))
    args = ap.parse_args()
    paths = [Path(lang) / "lectures" / f"week-{week}.html"
             for lang in ("cpp", "java") for week in range(8)]
    missing = [str(p) for p in paths if not (args.repository / p).is_file()]
    if missing:
        ap.error("Missing original lectures: " + ", ".join(missing))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        for relative in paths:
            raw = (args.repository / relative).read_bytes()
            text = extract(raw.decode("utf-8"))
            if len(text) < 500:
                raise ValueError(f"Unexpectedly short lesson: {relative}")
            doc = {"id":str(relative),"language":relative.parts[0],
                   "week":int(relative.stem.split("-")[1]),
                   "sha256":hashlib.sha256(raw).hexdigest(),"text":text}
            f.write(json.dumps(doc, ensure_ascii=False) + "\n")
    print(f"Wrote {len(paths)} original lessons to {args.output}")

if __name__ == "__main__":
    main()
