"""Smoke-test index building without downloading external sources."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from build_lecture_index import build

class IndexTests(unittest.TestCase):
    def test_index_metadata_and_normalization(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/"corpus.jsonl"
            docs=[
                {"id":"cpp/lectures/week-0.html","language":"cpp","week":0,
                 "text":"айнымалы int main cout бағдарлама бастау "*50},
                {"id":"java/lectures/week-0.html","language":"java","week":0,
                 "text":"public static void main java бағдарлама бастау "*50},
            ]
            p.write_text("\n".join(json.dumps(d,ensure_ascii=False) for d in docs),encoding="utf-8")
            index=build(p)
            self.assertEqual(index["format"],"tulpar-tfidf-v1")
            self.assertGreaterEqual(index["documents"],2)
            self.assertEqual({v["language"] for v in index["vectors"]},{"cpp","java"})
            self.assertTrue(all(v["source"].endswith("week-0.html") for v in index["vectors"]))
            self.assertTrue(all(sum(w*w for w in v["weights"].values())<=1.0001 for v in index["vectors"]))

if __name__=="__main__":
    unittest.main()
