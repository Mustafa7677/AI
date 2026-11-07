"""Kazakh/Russian/English query-expansion regression checks."""
import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from multilingual_queries import expand
from lecture_retrieval import LectureIndex,chunk_lesson
from grounded_mentor import answer

class MultilingualTests(unittest.TestCase):
    def test_kazakh_pointer(self):
        self.assertIn("pointer",expand("C++ көрсеткіш деген не?"))
    def test_russian_inheritance(self):
        self.assertIn("inheritance",expand("Java наследование"))
    def test_english_unchanged(self):
        self.assertEqual(expand("vector push_back"),"vector push_back")
    def test_expansion_limit(self):
        self.assertLessEqual(len(expand("айнымалы цикл массив класс память").split())-5,8)
    def test_retrieval_from_kazakh_question(self):
        doc={"id":"cpp/lectures/week-3.html","language":"cpp","week":3,
             "text":"pointer pointer reference memory heap"}
        index=LectureIndex(chunk_lesson(doc))
        result=answer(index,"көрсеткіш деген не?",language="cpp")
        self.assertEqual(result["status"],"retrieved")
        self.assertEqual(result["citations"][0]["source"],doc["id"])
    def test_unknown_still_abstains(self):
        doc={"id":"java/lectures/week-0.html","language":"java","week":0,
             "text":"class object Java"}
        index=LectureIndex(chunk_lesson(doc))
        self.assertEqual(answer(index,"белгісізғарыштермині")["status"],"not_found")

if __name__=="__main__":
    unittest.main()
