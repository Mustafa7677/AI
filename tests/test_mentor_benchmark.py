"""Regression tests for TULPAR's independent benchmark methodology."""
import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lecture_retrieval import LectureIndex,chunk_lesson
from benchmark_mentor import evaluate
from mentor_benchmark_cases import CASES

class BenchmarkTests(unittest.TestCase):
    def test_unique_cases(self):
        self.assertEqual(len(CASES),len({c["id"] for c in CASES}))
        self.assertEqual({c["language"] for c in CASES},{"cpp","java"})
    def test_no_claim_of_correct_answers(self):
        docs=[
            {"id":"cpp/lectures/week-0.html","language":"cpp","week":0,"text":"vector push_back pointer reference"},
            {"id":"java/lectures/week-0.html","language":"java","week":0,"text":"ArrayList add interface implements"}
        ]
        index=LectureIndex(c for d in docs for c in chunk_lesson(d))
        result=evaluate(index)
        self.assertEqual(result["count"],len(CASES))
        self.assertTrue(0<=result["retrieval_hit_rate"]<=1)
        self.assertTrue(0<=result["term_coverage"]<=1)
        self.assertTrue(all(all(src.startswith(r["language"]+"/") for src in r["source_ids"]) for r in result["records"]))

if __name__=="__main__":
    unittest.main()
