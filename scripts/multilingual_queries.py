"""Kazakh/Russian/English programming terminology normalization.

A deterministic multilingual query expansion layer, NOT a trained translator.
Each expansion is restricted to technical terms from the author's course domain.
"""
import re

ALIASES={
    "айнымалы":("variable","int","type"),
    "переменная":("variable","int","type"),
    "цикл":("loop","for","while"),
    "циклдер":("loop","for","while"),
    "массив":("array","arrays"),
    "жиым":("array","arrays"),
    "тізім":("list","vector","ArrayList"),
    "указатель":("pointer","pointers"),
    "көрсеткіш":("pointer","pointers"),
    "сілтеме":("reference","references"),
    "наследование":("inheritance","extends"),
    "мұрагерлік":("inheritance","extends"),
    "қате":("exception","error","catch"),
    "исключение":("exception","try","catch"),
    "функция":("function","method"),
    "әдіс":("method","function"),
    "класс":("class","object"),
    "сынып":("class","object"),
    "файл":("file","fstream","File"),
    "жад":("memory","pointer","heap"),
    "память":("memory","pointer","heap"),
}
WORD=re.compile(r"\w+",re.UNICODE)

def expand(question, max_expansions=8):
    tokens={t.casefold() for t in WORD.findall(question)}
    extra=[]
    for term,translations in ALIASES.items():
        if term in tokens:
            for translation in translations:
                if translation.casefold() not in tokens and translation not in extra:
                    extra.append(translation)
                if len(extra)>=max_expansions:
                    break
        if len(extra)>=max_expansions:
            break
    return question + (" " + " ".join(extra) if extra else "")
