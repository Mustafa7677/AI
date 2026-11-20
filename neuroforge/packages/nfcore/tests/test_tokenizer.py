from nfcore.tokenizer import ByteBPETokenizer

KK = "Қазақстан — әдемі ел. Өнер, ғылым, ұлттық құндылықтар: һ і ү ң 🚀"


def test_roundtrip_untrained():
    t = ByteBPETokenizer()
    assert t.decode(t.encode(KK)) == KK
    assert t.vocab_size == 256


def test_train_reaches_vocab():
    t = ByteBPETokenizer()
    t.train(KK * 50, 300)
    assert t.vocab_size == 300
    assert t.decode(t.encode(KK)) == KK


def test_compresses():
    t = ByteBPETokenizer()
    t.train(KK * 50, 300)
    assert len(t.encode(KK)) < len(KK.encode())


def test_unseen_text_roundtrip():
    t = ByteBPETokenizer()
    t.train(KK * 50, 300)
    s = "Мүлде жаңа сөйлем, English too 123"
    assert t.decode(t.encode(s)) == s


def test_small_corpus_stops_early():
    t = ByteBPETokenizer()
    t.train("ab", 1000)
    assert 256 <= t.vocab_size < 1000


def test_deterministic_and_save_load(tmp_path):
    a = ByteBPETokenizer()
    a.train(KK * 20, 280)
    b = ByteBPETokenizer()
    b.train(KK * 20, 280)
    assert a.merges == b.merges
    a.save(tmp_path / "t.json")
    c = ByteBPETokenizer.load(tmp_path / "t.json")
    assert c.encode(KK) == a.encode(KK)
    assert c.fingerprint() == a.fingerprint()


def test_stats():
    t = ByteBPETokenizer()
    s = t.stats("abc")
    assert s["bytes"] == 3 and s["tokens"] == 3
