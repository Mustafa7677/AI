"""Deterministic benchmark of retrieval, grounding, and held-out evaluation."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from lecture_retrieval import load_index
from grounded_mentor import answer
from train_lecture_classifier import train,predict,evaluate

class MentorTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)/"lectures.jsonl"
        docs=[]
        for week in range(8):
            docs.extend([
                {"id":f"cpp/lectures/week-{week}.html","language":"cpp","week":week,
                 "text":("cpp cout std::vector pointer template program "+str(week)+" ")*40},
                {"id":f"java/lectures/week-{week}.html","language":"java","week":week,
                 "text":("java ArrayList System.out.println interface class "+str(week)+" ")*40},
            ])
        self.path.write_text("\n".join(json.dumps(d) for d in docs),encoding="utf-8")
        self.index=load_index(self.path)

    def test_citation_grounded(self):
        response=answer(self.index,"std::vector pointer",language="cpp")
        self.assertEqual(response["status"],"retrieved")
        self.assertTrue(response["citations"])
        self.assertTrue(all(x["source"].startswith("cpp/") for x in response["citations"]))

    def test_unknown_abstains(self):
        response=answer(self.index,"neutrinoastrophysicsunknownword")
        self.assertEqual(response["status"],"not_found")
        self.assertFalse(response["citations"])

    def test_language_classifier(self):
        model=train(self.index.chunks)
        self.assertEqual(predict(model,"java ArrayList interface"),"java")
        self.assertEqual(predict(model,"cpp cout pointer"),"cpp")

    def test_holdout_split(self):
        model,metrics=evaluate(self.index.chunks,holdout_weeks=(1,5))
        self.assertEqual(metrics["split"],"held-out-lecture-weeks")
        self.assertGreater(metrics["test_chunks"],0)
        self.assertEqual(metrics["train_chunks"]+metrics["test_chunks"],len(self.index.chunks))
        self.assertTrue(0<=metrics["accuracy"]<=1)

if __name__=="__main__":
    unittest.main()
