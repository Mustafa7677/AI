# NeuroForge M1a — `nfcore` (tokenizer, GPT, training, introspection) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Нөлден BPE токенизатор, decoder-only GPT, нақты CPU training, checkpoint және 3D сабаққа арналған introspection беретін Python кітапхана `nfcore` + CLI.

**Architecture:** Таза Python пакеті `neuroforge/packages/nfcore`. Тек numpy + torch. Training метрикалары мен checkpoint-тер callback арқылы шығады (кейін API оларды DB/S3-ке жазады). Attention салмақтары introspection үшін анық (explicit) есептеледі.

**Tech Stack:** Python ≥3.11 (dev: 3.13), PyTorch (CPU), NumPy, pytest.

**Spec:** `docs/superpowers/specs/2026-11-20-neuroforge-design.md` (§6, §13), `docs/superpowers/specs/2026-11-20-neuroforge-platform-architecture.md` (§0).

M1 жоспарлары: **M1a (осы)** nfcore → M1b API + DB + sandbox + training job → M1c Web: дизайн жүйесі, Lesson Player, Transformer сабағы, Training Run беті.

## Global Constraints

- `nfcore` тәуелділіктері: тек `numpy`, `torch`; dev: `pytest`.
- Әдепкі модель конфигі: `vocab_size=8000, context_len=256, d_model=256, n_layers=6, n_heads=8, mlp_ratio=4`, tied embeddings, pre-LayerNorm, learned positional embeddings.
- Модель атауы `nf-edu-kk-v1`; метадерекке `"label": "оқу моделі"` және нақты `params_count` жазылады. «Claude»/«MiniClaude» атаулары қолданылмайды.
- Introspection енгізуі ≤ 32 токен; бос мәтін — қате.
- Ешқандай mock/жалған метрика: барлық сан нақты есептеуден.
- Барлық тест `cd neuroforge/packages/nfcore && python -m pytest -q` арқылы жүреді.

## Review Focus

1. Бос мәтін немесе тек бос орын `introspect`-ке → `ValueError("empty input")` (Task 6 тесті).
2. 32 токеннен ұзын енгізу → `ValueError("input too long: N tokens > 32")`, кесіп тастамайды (Task 6 тесті).
3. Қазақ әріптері (ә ғ қ ң ө ұ ү һ і), эмодзи, аралас тіл → encode/decode дәл қайтарады (Task 2 тесті).
4. Корпус мақсатты сөздіктен кіші → training ерте тоқтайды, `vocab_size` нақты санды көрсетеді, құламайды (Task 2 тесті).
5. Training кезінде loss NaN/inf болса → `TrainingDiverged` қатесі, үнсіз жалғаспайды (Task 5 тесті). Басқа токенизатормен checkpoint жүктеу → `ValueError` (Task 5 тесті).

---

### Task 1: Пакет қаңқасы және орта

**Files:**
- Create: `neuroforge/packages/nfcore/pyproject.toml`, `neuroforge/packages/nfcore/nfcore/__init__.py`, `neuroforge/packages/nfcore/tests/test_smoke.py`, `neuroforge/README.md`, `neuroforge/.gitignore`

**Interfaces:**
- Produces: импортталатын `nfcore` пакеті, `nfcore.__version__ = "0.1.0"`.

- [ ] **Step 1:** venv: `python3 -m venv neuroforge/.venv && neuroforge/.venv/bin/pip install -e "neuroforge/packages/nfcore[dev]"` (torch PyPI-дан; download.pytorch.org жабық). `.gitignore`: `.venv/`, `__pycache__/`, `*.pt`, `runs/`, `data/raw/`.
- [ ] **Step 2:** `tests/test_smoke.py`: `import nfcore, torch; assert nfcore.__version__ == "0.1.0"; assert torch.ones(2).sum().item() == 2`.
- [ ] **Step 3:** Run `python -m pytest -q` → 1 passed.
- [ ] **Step 4:** `neuroforge/README.md`: жоба не екені, құрылым (design doc §5), dev іске қосу командасы.
- [ ] **Step 5:** Commit `feat(nfcore): package skeleton`.

### Task 2: Byte-level BPE токенизатор

**Files:**
- Create: `nfcore/tokenizer.py`, `tests/test_tokenizer.py`

**Interfaces:**
- Produces:
  - `class ByteBPETokenizer` с `merges: list[tuple[int,int]]`, `vocab_size: int` (property = 256 + len(merges))
  - `train(self, text: str, vocab_size: int) -> None`
  - `encode(self, text: str) -> list[int]`, `decode(self, ids: list[int]) -> str` (`errors="replace"`)
  - `token_bytes(self, id: int) -> bytes`, `token_str(self, id: int) -> str`
  - `save(self, path: str | Path) -> None`, `@classmethod load(cls, path) -> ByteBPETokenizer` (JSON: `{"version":1,"merges":[[a,b],...]}`)
  - `fingerprint(self) -> str` — merges JSON-ының sha256 hex
  - `stats(self, text: str) -> dict` — `{"chars", "bytes", "tokens", "bytes_per_token", "unique_tokens"}`

- [ ] **Step 1: Failing tests**

```python
KK = "Қазақстан — әдемі ел. Өнер, ғылым, ұлттық құндылықтар: һ і ү ң 🚀"
def test_roundtrip_untrained(): t=ByteBPETokenizer(); assert t.decode(t.encode(KK))==KK; assert t.vocab_size==256
def test_train_reaches_vocab(): t=ByteBPETokenizer(); t.train(KK*50, 300); assert t.vocab_size==300; assert t.decode(t.encode(KK))==KK
def test_compresses(): t=ByteBPETokenizer(); t.train(KK*50, 300); assert len(t.encode(KK)) < len(KK.encode())
def test_unseen_text_roundtrip(): t=ByteBPETokenizer(); t.train(KK*50,300); s="Мүлде жаңа сөйлем, English too 123"; assert t.decode(t.encode(s))==s
def test_small_corpus_stops_early(): t=ByteBPETokenizer(); t.train("ab", 1000); assert 256 <= t.vocab_size < 1000
def test_deterministic_and_save_load(tmp_path): a=ByteBPETokenizer(); a.train(KK*20,280); b=ByteBPETokenizer(); b.train(KK*20,280); assert a.merges==b.merges; a.save(tmp_path/"t.json"); c=ByteBPETokenizer.load(tmp_path/"t.json"); assert c.encode(KK)==a.encode(KK) and c.fingerprint()==a.fingerprint()
def test_stats(): t=ByteBPETokenizer(); s=t.stats("abc"); assert s["bytes"]==3 and s["tokens"]==3
```

- [ ] **Step 2:** Run `python -m pytest tests/test_tokenizer.py -q` → FAIL (module missing).
- [ ] **Step 3:** Implement. Pre-tokenize with `re.findall(r"\s?\w+|\s?[^\w\s]+|\s+", text)` (Unicode `\w`), count each chunk's UTF-8 bytes as a tuple with frequency; loop: count adjacent pairs weighted by chunk frequency, pick max count, ties broken by smallest `(a,b)` (determinism), stop if best count < 2 or vocab reached; apply merge to all chunks; new id = 256 + index. `encode`: per chunk, repeatedly merge the pair with lowest merge rank (`dict[(a,b)] -> rank`).
- [ ] **Step 4:** Run tests → 7 passed.
- [ ] **Step 5:** Commit `feat(nfcore): byte-level BPE tokenizer`.

### Task 3: GPT конфиг және модель (trace-пен)

**Files:**
- Create: `nfcore/config.py`, `nfcore/model.py`, `tests/test_model.py`

**Interfaces:**
- Produces:
  - `@dataclass GPTConfig(vocab_size:int=8000, context_len:int=256, d_model:int=256, n_layers:int=6, n_heads:int=8, mlp_ratio:int=4, dropout:float=0.0)`; `__post_init__` → `ValueError` if `d_model % n_heads`; `head_dim` property; `params_count() -> int`; `to_dict()/from_dict()`.
  - `class GPT(nn.Module)(config)`; `forward(idx: LongTensor[B,T], targets: LongTensor[B,T]|None=None, capture: bool=False) -> tuple[Tensor logits[B,T,V], Tensor|None loss, ForwardTrace|None]`
  - `@dataclass ForwardTrace(tok_emb: Tensor[B,T,D], pos_emb: Tensor[T,D], q: list[Tensor[B,H,T,dh]], k: list[...], v: list[...], attn: list[Tensor[B,H,T,T]], residual: list[Tensor[B,T,D]] (len n_layers+1), final_logits: Tensor[B,T,V])`

- [ ] **Step 1: Failing tests**

```python
C=GPTConfig(vocab_size=300, context_len=32, d_model=32, n_layers=2, n_heads=4)
def test_params_formula(): m=GPT(C); assert C.params_count()==sum(p.numel() for p in m.parameters())
def test_default_params_range(): assert 6_000_000 < GPTConfig().params_count() < 8_000_000
def test_bad_heads(): pytest.raises(ValueError, GPTConfig, d_model=30, n_heads=4)
def test_shapes_and_loss(): m=GPT(C); x=torch.randint(0,300,(2,10)); lg,loss,_=m(x,x); assert lg.shape==(2,10,300) and loss.ndim==0
def test_causal(): torch.manual_seed(0); m=GPT(C).eval(); x=torch.randint(0,300,(1,10)); y=x.clone(); y[0,7:]=(y[0,7:]+1)%300; assert torch.allclose(m(x)[0][0,:7], m(y)[0][0,:7], atol=1e-6)
def test_trace(): m=GPT(C).eval(); _,_,tr=m(torch.randint(0,300,(1,6)),capture=True); a=tr.attn[0]; assert len(tr.attn)==2 and a.shape==(1,4,6,6); assert torch.allclose(a.sum(-1),torch.ones(1,4,6),atol=1e-5); assert torch.all(torch.triu(a,1)==0); assert len(tr.residual)==3
def test_too_long(): m=GPT(C); pytest.raises(ValueError, m, torch.zeros(1,33,dtype=torch.long))
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Params formula (tied, biases in Linear and LayerNorm): `V*D + Tctx*D + L*(2*2D + (3D*D+3D) + (D*D+D) + (D*mD+mD) + (mD*D+D)) + 2D` where `m=mlp_ratio`. Attention explicit: `scores = q@k.T/sqrt(dh)`, `masked_fill(-inf)` upper triangle, softmax, `@v` (no `scaled_dot_product_attention`, weights must be capturable). Init: normal(0, 0.02). Loss: cross-entropy on flattened logits.
- [ ] **Step 4:** Run → 7 passed.
- [ ] **Step 5:** Commit `feat(nfcore): GPT model with forward trace`.

### Task 4: Деректер және генерация

**Files:**
- Create: `nfcore/data.py`, `nfcore/generate.py`, `tests/test_data_generate.py`

**Interfaces:**
- Produces:
  - `split_ids(ids: np.ndarray, val_frac: float=0.1) -> tuple[np.ndarray, np.ndarray]` (соңғы бөлігі val, араласпайды)
  - `get_batch(ids: np.ndarray, batch_size:int, context_len:int, rng: np.random.Generator) -> tuple[LongTensor[B,T], LongTensor[B,T]]` (y = x-тің бір қадам ығысқаны); `ValueError` if `len(ids) <= context_len`
  - `generate(model: GPT, ids: list[int], max_new_tokens:int, temperature: float=1.0, top_k: int|None=None, seed: int|None=None) -> Iterator[int]`; `temperature==0` → greedy; контекст `context_len`-нен асса, соңғы терезе қолданылады.

- [ ] **Step 1: Failing tests**

```python
def test_split(): tr,va=split_ids(np.arange(100)); assert len(va)==10 and tr[-1]==89 and va[0]==90
def test_batch_shift(): x,y=get_batch(np.arange(50),4,8,np.random.default_rng(0)); assert x.shape==(4,8) and torch.equal(x[:,1:],y[:,:-1])
def test_batch_short(): pytest.raises(ValueError,get_batch,np.arange(5),1,8,np.random.default_rng(0))
def test_greedy_deterministic(): m=GPT(C).eval(); a=list(generate(m,[1,2,3],5,temperature=0)); b=list(generate(m,[1,2,3],5,temperature=0)); assert a==b and len(a)==5
def test_seeded_sampling(): m=GPT(C).eval(); assert list(generate(m,[1],8,seed=7))==list(generate(m,[1],8,seed=7))
def test_long_context_window(): m=GPT(C).eval(); assert len(list(generate(m,list(range(40)),3,temperature=0)))==3
```
(`C` — Task 3-тегі шағын конфиг, `tests/conftest.py`-ге fixture ретінде шығарылады.)

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (`torch.no_grad()`, sampling `torch.multinomial` with `torch.Generator().manual_seed(seed)`). **Step 4:** Run → pass.
- [ ] **Step 5:** Commit `feat(nfcore): data batching and generation`.

### Task 5: Training loop және checkpoint

**Files:**
- Create: `nfcore/train.py`, `nfcore/checkpoint.py`, `tests/test_train.py`

**Interfaces:**
- Consumes: `GPT`, `GPTConfig`, `get_batch`, `split_ids`, `ByteBPETokenizer.fingerprint()`.
- Produces:
  - `@dataclass TrainConfig(steps:int=2000, batch_size:int=16, lr:float=3e-4, min_lr:float=3e-5, warmup_steps:int=100, weight_decay:float=0.1, grad_clip:float=1.0, eval_interval:int=100, eval_iters:int=20, ckpt_interval:int=500, seed:int=1337)`
  - `lr_at(step:int, cfg: TrainConfig) -> float`: `step < warmup` → `lr*(step+1)/warmup`; else cosine from `lr` to `min_lr` over `[warmup, steps]`; `step >= steps` → `min_lr`.
  - `@dataclass MetricEvent(step:int, split: Literal["train","val"], loss: float, lr: float, tokens_per_s: float)`
  - `class TrainingDiverged(RuntimeError)`
  - `train(model, train_ids, val_ids, cfg, on_metric: Callable[[MetricEvent],None]=lambda e:None, on_checkpoint: Callable[[int, float|None],None]=lambda s,v:None, should_stop: Callable[[],bool]=lambda:False) -> TrainResult(steps_done:int, final_train_loss:float, final_val_loss:float|None, stopped:bool)`; AdamW (decay only on ≥2-D params), train metric every step-batch, val every `eval_interval` and at the end; `on_checkpoint(step, val_loss)` every `ckpt_interval` and at the end; NaN/inf loss → `TrainingDiverged`.
  - `save_checkpoint(path, model, config: GPTConfig, step:int, tokenizer_fp:str, extra: dict) -> str` (sha256 of file); payload `{"format":"nfcore-ckpt-1","model":state_dict,"config":config.to_dict(),"step","tokenizer_fp","meta":{"name":"nf-edu-kk-v1","label":"оқу моделі","params_count",**extra}}`
  - `load_checkpoint(path, expected_tokenizer_fp: str|None=None) -> tuple[GPT, dict meta]` (`weights_only=True`); fp mismatch → `ValueError("tokenizer mismatch")`.

- [ ] **Step 1: Failing tests**

```python
def test_lr_schedule(): c=TrainConfig(steps=100,warmup_steps=10,lr=1e-3,min_lr=1e-4); assert lr_at(0,c)==pytest.approx(1e-4); assert lr_at(9,c)==pytest.approx(1e-3); assert lr_at(100,c)==pytest.approx(1e-4); assert lr_at(55,c)==pytest.approx(5.5e-4,rel=1e-3)
def test_overfit_real_learning():  # дәлел: салмақтар шын жаңарады
    torch.manual_seed(0); ids=np.tile(np.arange(20),40); m=GPT(C); ev=[]
    r=train(m,ids,ids,TrainConfig(steps=300,batch_size=8,lr=3e-3,warmup_steps=10,eval_interval=100,eval_iters=2,ckpt_interval=1000),on_metric=ev.append)
    tr=[e.loss for e in ev if e.split=="train"]; assert tr[-1] < 0.1*tr[0]; assert any(e.split=="val" for e in ev)
def test_diverged(monkeypatch):
    orig=GPT.forward
    monkeypatch.setattr(GPT,"forward",lambda self,*a,**k:(lambda r:(r[0],r[1]*float("nan") if r[1] is not None else None,r[2]))(orig(self,*a,**k)))
    ids=np.tile(np.arange(20),40); pytest.raises(TrainingDiverged,train,GPT(C),ids,ids,TrainConfig(steps=5,batch_size=2))
def test_stop(): ids=np.tile(np.arange(20),40); r=train(GPT(C),ids,ids,TrainConfig(steps=1000,ckpt_interval=10**6),should_stop=lambda:True); assert r.stopped and r.steps_done<1000
def test_checkpoint_roundtrip(tmp_path): m=GPT(C).eval(); sha=save_checkpoint(tmp_path/"c.pt",m,C,5,"fp",{}); m2,meta=load_checkpoint(tmp_path/"c.pt","fp"); x=torch.randint(0,300,(1,8)); assert torch.allclose(m(x)[0],m2(x)[0]); assert sha==hashlib.sha256((tmp_path/"c.pt").read_bytes()).hexdigest(); assert meta["meta"]["label"]=="оқу моделі"
def test_checkpoint_tokenizer_mismatch(tmp_path): save_checkpoint(tmp_path/"c.pt",GPT(C),C,1,"a",{}); pytest.raises(ValueError,load_checkpoint,tmp_path/"c.pt","b")
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → pass (overfit тесті CPU-да < 60 s).
- [ ] **Step 5:** Commit `feat(nfcore): real training loop and checkpoints`.

### Task 6: Introspection (3D сабаққа нақты тензорлар)

**Files:**
- Create: `nfcore/introspect.py`, `tests/test_introspect.py`

**Interfaces:**
- Consumes: `GPT.forward(capture=True)`, `ForwardTrace`, `ByteBPETokenizer`.
- Produces:
  - `@dataclass PCA3(mean: list[float], components: list[list[float]])`; `fit_pca3(weight: Tensor[V,D]) -> PCA3` (SVD, тұрақты таңба: әр компоненттің ең үлкен абсолют элементі оң); `project(x: Tensor[...,D]) -> Tensor[...,3]`.
  - `MAX_INTROSPECT_TOKENS = 32`
  - `introspect(model: GPT, tok: ByteBPETokenizer, text: str, pca: PCA3, top_k: int=10) -> dict`, JSON-serializable:
    ```
    {"model": {"name","label","params_count","config"},
     "tokens": [{"id","text","bytes_hex"}],
     "embeddings3d": [[x,y,z]] (tok_emb проекциясы), "positions3d": [[x,y,z]],
     "layers": [{"attention": [H][T][T], "q_norm": [H][T], "k_norm": [H][T], "v_norm": [H][T],
                 "residual_norm": [T]}],              # len = n_layers
     "residual_norm_in": [T],
     "next_token": [{"id","text","prob"}],             # top_k, prob кему ретімен
     "shapes": {"tokens":[T], "embedding":[T,D], "qkv_per_head":[H,T,dh], "attention":[H,T,T], "mlp_hidden":[T,mD], "logits":[V]}}
    ```
    Бос/тек бос орын → `ValueError("empty input")`; > 32 токен → `ValueError(f"input too long: {n} tokens > 32")`. Сандар 4 ондық белгіге дейін дөңгелектенеді (JSON өлшемі үшін).

- [ ] **Step 1: Failing tests**

```python
def test_introspect_shapes(tiny): m,tok,pca=tiny; r=introspect(m,tok,"Сәлем әлем",pca,top_k=5); T=len(r["tokens"]); assert len(r["layers"])==2 and len(r["layers"][0]["attention"])==4 and len(r["layers"][0]["attention"][0])==T; assert len(r["embeddings3d"][0])==3; json.dumps(r)
def test_attention_rows_sum_and_causal(tiny):
    m,tok,pca=tiny; a=np.array(introspect(m,tok,"Сәлем әлем",pca)["layers"][1]["attention"]); assert np.allclose(a.sum(-1),1,atol=1e-3); assert np.all(np.triu(a,1)==0)
def test_next_token_sorted(tiny): m,tok,pca=tiny; r=introspect(m,tok,"Сәлем",pca,top_k=5); p=[x["prob"] for x in r["next_token"]]; assert p==sorted(p,reverse=True) and 0<sum(p)<=1.0001 and len(p)==5
def test_empty(tiny): m,tok,pca=tiny; pytest.raises(ValueError,introspect,m,tok,"   ",pca)
def test_too_long(tiny): m,tok,pca=tiny; pytest.raises(ValueError,introspect,m,tok,"сөз "*40,pca)
def test_pca_stable(): w=torch.randn(50,16); a=fit_pca3(w); b=fit_pca3(w.clone()); assert a==b
def test_tokens_text_concat(tiny): m,tok,pca=tiny; r=introspect(m,tok,"Қазақ тілі",pca); assert "".join(t["text"] for t in r["tokens"])=="Қазақ тілі"
```
(`tiny` fixture — conftest-те: шағын корпусқа 300 vocab токенизатор + Task 3 конфигі + `fit_pca3`.)

Ескерту: бір токен UTF-8 әріптің ортасынан бөлінуі мүмкін; `token_str` бөлек декодталғанда `�` береді, бірақ `tokens[*].text` мәтіндері қатар қосылғанда түпнұсқа шығуы үшін `text` өрісі инкременталды декодпен есептеледі (толық емес байттар келесі токенге ауысады, бос `""` болуы мүмкін). `bytes_hex` әрқашан нақты.

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → pass.
- [ ] **Step 5:** Commit `feat(nfcore): introspection for lesson visualizations`.

### Task 7: CLI және нақты корпуспен бірінші модель

**Files:**
- Create: `nfcore/cli.py`, `nfcore/__main__.py`, `scripts/fetch_corpus.py`, `data/SOURCES.md`, `tests/test_cli.py`

**Interfaces:**
- Consumes: барлық алдыңғы task-тар.
- Produces CLI:
  - `python -m nfcore train-tokenizer --input CORPUS.txt --vocab 8000 --out tok.json`
  - `python -m nfcore train --tokenizer tok.json --input CORPUS.txt --out-dir runs/NAME [--steps N --batch-size B --d-model … ]` → `runs/NAME/{ckpt_step{N}.pt, best.pt, metrics.jsonl, pca.json, config.json}`; metrics.jsonl әр `MetricEvent` бір жол.
  - `python -m nfcore introspect --ckpt runs/NAME/best.pt --tokenizer tok.json --text "..."` → JSON stdout.
  - `python -m nfcore generate --ckpt … --tokenizer … --text … --max-new 50 --temperature 0.8`

- [ ] **Step 1: Failing test** `test_cli_end_to_end(tmp_path)`: 2 KB корпус жазады, `train-tokenizer --vocab 300`, `train --steps 30 --d-model 32 --n-layers 2 --n-heads 4 --context-len 32 --batch-size 4`, содан кейін `introspect` — `subprocess.run([sys.executable,"-m","nfcore",…], check=True)`; `metrics.jsonl`-де ≥ 30 train жолы, `best.pt` бар, introspect JSON-ында `tokens`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement CLI (`argparse`). **Step 4:** Run → pass.
- [ ] **Step 5: Корпус.** `scripts/fetch_corpus.py` — тек рұқсат етілген хосттардан (GitHub raw, PyPI) **ашық лицензиялы** қазақша мәтін жинайды → `data/raw/` (git-ке кірмейді), лицензиясы мен URL-ін `data/SOURCES.md`-ге жазады. **Шешім нүктесі:** ≥ 5 MB лицензиясы анық қазақша мәтін табылмаса — тоқтап, иесінен сұрау (желіге хост қосу немесе өз мәтінін беру). Табылса:
- [ ] **Step 6:** `train-tokenizer --vocab 8000`, содан кейін `train` әдепкі конфигпен (~1 сағ CPU, `--steps` tokens/s өлшеміне қарай таңдалады). Нәтиже: val loss қисығы `metrics.jsonl`-де төмендейді; `generate` қазақша сөз тәрізді мәтін береді. Checkpoint-тер git-ке кірмейді.
- [ ] **Step 7:** `neuroforge/README.md`-ге модельдің нақты өлшемі, корпус көлемі, final val loss жазылады. Commit `feat(nfcore): CLI and first nf-edu-kk-v1 training run`.
