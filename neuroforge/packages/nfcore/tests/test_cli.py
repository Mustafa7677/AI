import json
import subprocess
import sys


def run(*args, cwd):
    return subprocess.run([sys.executable, "-m", "nfcore", *args], cwd=cwd,
                          check=True, capture_output=True, text=True)


def test_cli_end_to_end(tmp_path):
    corpus = tmp_path / "c.txt"
    corpus.write_text("Қазақ тілі — түркі тілдерінің бірі. Сәлем, әлем! " * 50, encoding="utf-8")
    run("train-tokenizer", "--input", str(corpus), "--vocab", "300", "--out", "tok.json", cwd=tmp_path)
    run("train", "--tokenizer", "tok.json", "--input", str(corpus), "--out-dir", "runs/t",
        "--steps", "30", "--d-model", "32", "--n-layers", "2", "--n-heads", "4",
        "--context-len", "32", "--batch-size", "4", "--eval-interval", "10", "--eval-iters", "2",
        cwd=tmp_path)
    run_dir = tmp_path / "runs" / "t"
    lines = [json.loads(l) for l in (run_dir / "metrics.jsonl").read_text().splitlines()]
    assert sum(1 for l in lines if l["split"] == "train") >= 30
    for f in ("best.pt", "pca.json", "config.json"):
        assert (run_dir / f).exists()
    out = run("introspect", "--ckpt", "runs/t/best.pt", "--tokenizer", "tok.json",
              "--text", "Сәлем", cwd=tmp_path)
    assert json.loads(out.stdout)["tokens"]
    gen = run("generate", "--ckpt", "runs/t/best.pt", "--tokenizer", "tok.json",
              "--text", "Қазақ", "--max-new", "5", "--temperature", "0", cwd=tmp_path)
    assert gen.stdout.startswith("Қазақ")
