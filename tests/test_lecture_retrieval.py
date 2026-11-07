"""Unit tests for deterministic lecture retrieval and corpus isolation."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lecture_retrieval import LectureIndex, chunk_lesson, load_index

class RetrievalTests(unittest.TestCase):
    def setUp(self):
        docs = [
            {"id":"cpp/lectures/week-2.html","language":"cpp","week":2,
             "text":"std::vector элементтерді сақтау үшін қолданылады. vector push_back өлшемді арттырады."},
            {"id":"java/lectures/week-2.html","language":"java","week":2,
             "text":"ArrayList тізіміне элемент қосу үшін add әдісі пайдаланылады."},
        ]
        self.index = LectureIndex(c for d in docs for c in chunk_lesson(d, max_words=40, overlap=5))

    def test_cpp(self):
        result = self.index.search("vector push_back", language="cpp")
        self.assertEqual(result[0]["source"], "cpp/lectures/week-2.html")

    def test_java(self):
        result = self.index.search("ArrayList add", language="java")
        self.assertEqual(result[0]["language"], "java")

    def test_no_hallucinated_hit(self):
        self.assertEqual(self.index.search("кванттықфизикажоқ"), [])

    def test_empty(self):
        self.assertEqual(self.index.search(""), [])

    def test_language_filter(self):
        self.assertEqual(self.index.search("vector", language="java"), [])

    def test_chunk_overlap(self):
        doc = {"id":"x","language":"cpp","week":0,"text":"a b c d e f g h i j"}
        chunks = list(chunk_lesson(doc, max_words=5, overlap=2))
        self.assertEqual(chunks[0]["text"], "a b c d e")
        self.assertTrue(chunks[1]["text"].startswith("d e"))

    def test_invalid_overlap(self):
        with self.assertRaises(ValueError):
            list(chunk_lesson({"id":"x","language":"cpp","week":0,"text":"abc"},5,5))

    def test_duplicate_ids_rejected(self):
        doc = {"id":"cpp/lectures/week-0.html","language":"cpp","week":0,"text":"hello"}
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/"lessons.jsonl"
            p.write_text(json.dumps(doc)+"\n"+json.dumps(doc)+"\n")
            with self.assertRaises(ValueError):
                load_index(p)

if __name__ == "__main__":
    unittest.main()
