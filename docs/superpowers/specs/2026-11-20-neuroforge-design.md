# NeuroForge AI — Design (жалпы архитектура + Milestone 1)

Күні: 2026-11-20 · Мәртебе: бекітуді күтуде

## 1. Мақсат және себеп

NeuroForge AI — адам ИИ-ды тек қолданбай, оның ішкі құрылысын түсініп, өз моделін жобалап, оқытып, бағалап, жариялай алатын қазақтілді (kk/en/ru) AI инженерия университеті мен платформасы. Екі өнім бір экожүйеде:

- **A. Advanced AI Assistant** — стриминг чат, файлдар, код, құралдар, RAG, агенттер (алдымен сыртқы қуатты модельдер арқылы, кейін өзіміз орналастыратын open-weight модельдер).
- **B. AI Development Platform** — Tokenizer/Dataset/Architecture/Training/Evaluation/Deployment студиялары + AI Academy (CS50 деңгейі, 3Blue1Brown стиліндегі 3D визуализациялар).

Неге: қазақ тілінде «ИИ-ды өзің құр» деген интерактив, терең платформа жоқ (бәсеке зерттеуі, 2026-11-19). Ерекшелік — визуализация, нақты код және **шынайы** есептеулер бір сабақта байланысқан.

## 2. Мақсаттар / мақсат емес / анти-мақсат

**Мақсаттар (жалпы):** иесінің техникалық талаптарындағы (TR) 1–10 бөлімдер, кезеңмен.

**Milestone 1 мақсаты:** «Inside a Transformer — From Text to Intelligence» сабағының толық тік кесіндісі + нақты training pipeline-ның минималды нұсқасы. Ол кейінгі барлық сабақтарға қайта қолданылатын негізгі компоненттерді құрайды.

**M1-де жоқ (кейін):** AI Assistant чаты, AI Tutor, файл талдау/RAG, Architecture Builder UI, Dataset Studio UI, LoRA/fine-tuning, Model Hub, қоғамдастық, төлем, Kubernetes, GPU.

**Анти-мақсаттар (жұмыс істесе де сәтсіздік деп есептелетіндер):**
- Mock/жалған progress, accuracy, loss немесе дайын «ойнатылатын» анимация нақты есептеу ретінде көрсетілсе.
- Шағын оқу моделін «Claude баламасы» деп атау. Модель интерфейсте әрқашан «оқу моделі, ~N млн параметр» деп белгіленеді.
- Ғылыми мағынасы жоқ сәндік 3D.
- Sandbox-сыз пайдаланушы кодын орындау (dev-те де жоқ: Docker жоқ болса, runner бас тартады).
- «Claude», «MiniClaude» сияқты бөтен сауда белгілері өнім атауында.

## 3. Шектеулер

- Даму ортасы: 4 CPU, 15 GB RAM, **GPU жоқ**; Postgres 16, Redis 7, Docker, Node 22, Python 3.13 бар.
- Желі: PyPI, npm, GitHub ашық; **Hugging Face, Wikipedia, Gutenberg жабық** → дайын салмақтар мен HF datasets мұнда жүктелмейді. Сондықтан M1 моделі нөлден оқытылады; production серверінде HF қосылады (модель көзі конфигурацияланады).
- Жалғыз иесі + Claude әзірлеуші. Жылдам, бірақ шынайы нәтиже маңызды.
- Код `neuroforge/` папкасында, `Mustafa7677/AI` репосында (кейін бөлек репоға көшіруге дайын). TULPAR файлдарына тимейміз.
- Мазмұн тілі: интерфейс және сабақтар қазақша (kk) бірінші; en/ru i18n кілттері арқылы кейін.

## 4. Қарастырылған тәсілдер (M1 үшін)

| Тәсіл | Мәні | Таңдалды ма |
|---|---|---|
| A. Transformer сабағы — тік кесінді | 3D + нақты модель тензорлары + Monaco + sandbox + автотексеру + сақтау | **Иә** (иесі таңдады: «Start») |
| B. Phase 1 Core Platform | тіркелу, чат-ассистент (сыртқы API), файлдар, академия қаңқасы | Жоқ — ақылы кілттер керек, ерекшелігі аз; M2–M3-ке |
| C. Екеуін жұқа | шашырайды, ешқайсысы сапалы болмайды | Жоқ |

Иесінің өзі белгілеген стек сақталады: Next.js + TypeScript + Tailwind + React Three Fiber/Drei + Motion + Monaco + MDX; FastAPI + PostgreSQL + Redis + Object Storage + task queue; PyTorch; Docker.

## 5. Жалпы архитектура

```
neuroforge/
  apps/web/            Next.js 15 (App Router, TS, Tailwind, R3F, Drei, Motion, Monaco, MDX)
  services/api/        FastAPI, SQLAlchemy 2 + Alembic, Pydantic v2
  services/worker/     RQ worker: training jobs, code-run jobs
  packages/nfcore/     Python кітапхана: BPE tokenizer, GPT моделі, train loop, introspection
  sandbox/             Пайдаланушы кодына арналған Docker image (python + numpy + nfcore-lite)
  content/lessons/     MDX сабақтар + жаттығулар (hidden tests)
  infra/               docker-compose (postgres, redis, minio, api, worker, web), .env.example
  docs/                архитектура, GPU/бюджет жоспары
```

Деректер ағыны (M1):

```
Browser ──HTTP/SSE──▶ FastAPI ──▶ Postgres (users, progress, runs, metrics)
   │                     │ ├──▶ Redis/RQ ──▶ worker ──▶ Docker sandbox (user code)
   │                     │ │                      └──▶ nfcore training ──▶ MinIO (checkpoints)
   │                     └──▶ inference: nfcore моделі (жадта, checkpoint-тен жүктеледі)
   └── R3F 3D сахна ◀── introspection JSON (нақты тензорлар)
```

Шешімдер (менің call-дарым, түзетуге болады):
- **Task queue: RQ** (Redis үстінде, қарапайым; Celery-ге ауысу интерфейс арқылы оқшауланады).
- **Object storage: MinIO** (S3 API), dev-те де; production-да кез келген S3.
- **Auth: email + пароль (argon2id), HttpOnly session cookie**, CSRF қорғанысы. OAuth кейін.
- **State (web): zustand** — сабақ мәтіні, 3D сахна және параметрлер ортақ store арқылы синхрондалады.

## 6. nfcore — нақты модель

- **Tokenizer:** byte-level BPE, нөлден оқытылады (өз кодымыз, тек Python/NumPy, сабақта түсіндіріледі). vocab ≈ 8000. `encode/decode`, статистика.
- **Модель `nf-edu-kk-v1`:** decoder-only GPT, PyTorch. Бастапқы конфиг: d_model 256, 6 қабат, 8 head, context 256, tied embeddings, pre-LayerNorm, learned positional embeddings → ≈ 6–7 млн параметр (дәл сан кодтан есептеліп, UI-да көрсетіледі).
- **Корпус:** ашық лицензиялы қазақша + аз ағылшынша мәтін, рұқсат етілген хосттар (GitHub/PyPI) арқылы алынады; әр дереккөздің лицензиясы `data/SOURCES.md`-ге жазылады. Табылмаса — иесіне сұрақ (§12).
- **Training:** AdamW, cosine LR + warmup, grad clipping, train/val split, әр N қадамда val loss, checkpoint (салмақ + optimizer + config + tokenizer hash). CPU-да ~1 сағатқа есептелген. Барлық метрика нақты, DB-ге жазылады.
- **Introspection inference:** бір сұраныспен қайтарады: tokens/ids, әр токеннің embedding-і (PCA → 3D, PCA матрицасы модельмен бірге сақталады, сондықтан координаттар тұрақты), әр қабаттың әр head-інің attention матрицасы, Q/K/V векторларының (таңдалған токен үшін) нормалары, residual stream нормалары, келесі токеннің top-k ықтималдықтары, tensor shapes. Енгізу ≤ 32 токен (3D оқылуы үшін).

## 7. Sandbox (пайдаланушы кодын орындау)

- Әр орындау — жаңа Docker контейнер: `--network none`, `--memory 512m`, `--cpus 1`, `--pids-limit 128`, read-only rootfs + tmpfs `/tmp`, non-root user, wall timeout 10 s, stdout/stderr ≤ 64 KB.
- Image: python 3.12-slim + numpy + `nfcore-lite` (NumPy ғана нұсқа, сабақ тапсырмалары үшін).
- Грейдер: жасырын тесттер сол контейнерде іске қосылып, құрылымды JSON нәтиже береді (өтті/өтпеді, күтілген/алынған, түсініктеме).
- Docker daemon жоқ болса — runner `503 sandbox unavailable` қайтарады; ешқашан хостта тікелей орындамайды.

## 8. Дерекқор сызбасы (M1, Postgres)

```
users(id uuid pk, email citext unique, password_hash, display_name, locale, role ['student'|'admin'], created_at)
sessions(id uuid pk, user_id fk, token_hash unique, expires_at, created_at)
courses(id text pk, title_kk, order)
lessons(id text pk, course_id fk, slug, title_kk, version, order)
exercises(id text pk, lesson_id fk, kind ['code'|'quiz'], max_score)
lesson_progress(user_id fk, lesson_id fk, step text, completed_at, pk(user_id,lesson_id))
submissions(id uuid pk, user_id fk, exercise_id fk, code text, status ['queued'|'running'|'passed'|'failed'|'error'],
            score, result jsonb, created_at, finished_at)
models(id text pk, name, kind ['edu'|'external'], config jsonb, params_count bigint, created_at)
training_runs(id uuid pk, model_id fk, owner_id fk null, status ['queued'|'running'|'succeeded'|'failed'|'cancelled'],
              hyperparams jsonb, dataset_ref, device, started_at, finished_at, error text)
training_metrics(run_id fk, step int, split ['train'|'val'], loss real, lr real, tokens_per_s real, ts, pk(run_id,step,split))
checkpoints(id uuid pk, run_id fk, step int, uri text, sha256, size_bytes, val_loss real, created_at)
```

Курс/сабақ/жаттығу метадеректері `content/` ішінен seed скриптімен синхрондалады (MDX — ақиқат көзі).

## 9. API (M1, `/api/v1`)

| Әдіс | Жол | Мақсаты |
|---|---|---|
| POST | /auth/register, /auth/login, /auth/logout | session cookie |
| GET | /me | ағымдағы пайдаланушы |
| GET | /lessons/{id} | метадерек + прогресс |
| PUT | /lessons/{id}/progress | қадамды белгілеу |
| POST | /models/{id}/introspect | `{text}` → нақты тензорлар JSON (rate limited) |
| POST | /models/{id}/generate | `{text, max_tokens, temperature}` → SSE токен ағыны |
| GET | /models/{id} | config, параметр саны, қай checkpoint, «оқу моделі» белгісі |
| POST | /exercises/{id}/submissions | `{code}` → 202 + submission id |
| GET | /submissions/{id} | статус + нәтиже (немесе SSE) |
| POST | /training-runs | (admin, M1) жаңа run, hyperparams |
| GET | /training-runs/{id}, /training-runs/{id}/metrics?after=step | нақты метрикалар (SSE/poll) |
| GET | /health | DB/Redis/MinIO/sandbox күйі |

Қате пішімі: `{error:{code,message}}`. Барлық жауапта mock жоқ; модель жүктелмесе — 503.

## 10. UI/UX

**Дизайн тілі «Neural Universe»:** deep navy/graphite фон, electric blue/cyan/violet акценттер, таза типография (Inter + JetBrains Mono, кирилл/қазақ әріптерін толық қолдайтын), бір компонент жүйесі (Button, Panel, Slider, Tabs, CodeEditor, TensorBadge, MetricChart), motion тек түсіндіру үшін. `prefers-reduced-motion` қолдауы.

**Lesson Player (desktop):** сол — курс құрылымы/прогресс; орта — 3D сахна немесе лекция; оң — түсіндірме, формулалар (KaTeX), параметрлер, (M2-де AI Tutor); төмен — Monaco, Terminal/Output, Logs. Панельдер жиналады; full-screen focus mode. Мобильде — тігінен стек, 3D жеңілдетілген, WebGL жоқ болса 2D fallback (SVG attention heatmap, embedding scatter).

**Сабақ «Inside a Transformer» (10 қадам, TR §8):**
1. Оқушы сөйлем енгізеді → `/introspect`.
2. Токендерге бөлу — 3D-де токен блоктары, BPE біріктірулері көрсетіледі.
3. Embeddings — PCA-3D нүктелер, ұқсас токендер жақын.
4. Attention — Q·K → softmax → V, таңдалған head-тің нақты салмақтары доғалар ретінде; қабат/head таңдау.
5. Transformer қабаттары — residual stream, MLP, LayerNorm; tensor shapes әр кезеңде.
6. Next-token prediction — top-k бағаналар, temperature слайдері (нақты `/generate`).
7. Code along — NumPy-да attention-ды өзі жазады (Monaco).
8. Нақты модельмен inference — өз сөйлемдерімен тексереді.
9. Problem set — `scaled_dot_product_attention`, `causal_mask`, `softmax` (тұрақты нұсқа) — sandbox + жасырын тесттер.
10. Нәтиже сақталады, балл мен түсіндірме көрсетіледі, прогресс картада жаңарады.

Мазмұн MDX-те: `<Scene step="attention" layer={2} head={5}/>`, `<Exercise id="..."/>`, `<Formula>` компоненттері сабақ мәтінін сахнамен синхрондайды.

**Training Run беті (M1, минималды):** run іске қосу (admin), нақты loss/val loss графигі, tokens/s, checkpoint тізімі, «осы checkpoint-пен сабақта тексеру».

## 11. Кезеңдер және тексерілетін нәтижелер

| Кезең | Мазмұн | Тексерілетін нәтиже |
|---|---|---|
| **M1** (осы) | monorepo, compose, auth, nfcore (BPE, GPT, train, introspect), sandbox + грейдер, Transformer сабағы (10 қадам), Training Run беті | `docker compose up` → тіркелу → сабақты өту → нақты модель тензорлары 3D-де → тапсырма sandbox-та тексеріліп DB-де → training run нақты loss сызады, checkpoint MinIO-да, жаңа checkpoint сабақта қолданылады. pytest + vitest + Playwright e2e жасыл. |
| M2 | AI Tutor (сабақ контексті + провайдер абстракциясы), Neural Network сабағы (forward/backprop 3D), білім картасы | Tutor сахнадағы қабатқа сілтеп жауап береді; 2-ші сабақ тек қайта қолданылатын компоненттерден жиналады |
| M3 | AI Assistant: стриминг чат, жобалар, тарих, файлдар (PDF/DOCX/TXT/CSV) + RAG дәйексөзбен, модель таңдау | нақты провайдер арқылы жауап, құжаттан дәйексөз |
| M4 | Studios: Tokenizer, Dataset (upload, dedup, split, version), Architecture Builder (конфиг → параметр саны → PyTorch код экспорты), training UI пайдаланушыларға, квоталар | пайдаланушы өз деректерімен өз моделін CPU/GPU-да оқытады |
| M5 | GPU workers, LoRA/QLoRA (PEFT/TRL) open-weight модельдерге, experiment tracking, evaluation (reasoning/coding/language/hallucination/safety), deployment (vLLM, API кілттер, usage) | fine-tune → eval салыстыру → REST endpoint |
| M6 | Model Hub, model cards, public/private, қоғамдастық, Coding Workspace + агенттер/құралдар | модельді бөлісу, басқа пайдаланушы қолданады |
| Phase 4 | дербес pre-training зерттеуі | бюджет пен команда бойынша жеке жоспар |

## 12. Үлкен модельдер үшін ресурс жоспары (TR acceptance #10, бағалау)

Есеп: training FLOPs ≈ 6 · N(параметр) · D(токен); A100 ~40% тиімділікпен ≈ 1.25·10¹⁴ FLOP/s; GPU-сағат ≈ $2 (нарық бағасы ауытқиды).

| Мақсат | N | D | GPU-сағат (≈) | Есептеу құны (≈) | Команда |
|---|---|---|---|---|---|
| M1 оқу моделі | 7M | 30M | CPU, ~1 сағ | ~0 | 1 + Claude |
| Шағын қазақша LM | 125M | 2.5B | ~4 | ~$10 | 1–2 |
| 1B модель нөлден | 1B | 20B | ~270 | ~$550 + деректер | 2–4 |
| 7B модель нөлден | 7B | 140B | ~13 000 | ~$26 000 + деректер, eval | 5–10 ML инженер |
| 7B LoRA fine-tune | 7B | 10–100M | 1–20 | $2–40 | 1–2 |
| Claude/GPT деңгейі | жария емес | — | бірнеше рет үлкен ретке артық | жүздеген млн $ деңгейі | үлкен зерттеу ұйымы |

Сандар — рет бағалау; нақты жоспар M5-те өлшеулерден кейін жаңартылады. Қазақша сапалы деректердің жетіспеушілігі — есептеуден кем емес шектеу.

## 13. Тестілеу

- nfcore: tokenizer round-trip, параметр санының формуласы, attention маскасы, бір батчта overfit (loss → ~0) — модель шынымен үйренетінін дәлелдейді, checkpoint save/load детерминизмі.
- API: pytest + нақты Postgres/Redis (compose), auth, introspect пішіндері, submission ағыны.
- Sandbox: желі жабық, жад/уақыт шегі, fork bomb, файл жүйесіне жазу — бәрі бас тартылатыны тексеріледі.
- Web: vitest (store, компоненттер), Playwright e2e (толық сабақ, WebGL жоқ кезде 2D fallback).

## 14. Құрастырушыға қалдырылғандар

Нақты кітапхана нұсқалары, компонент атаулары, 3D сахнаның визуалды детальдары (дизайн тілі шегінде), корпусты жинау скрипттері, PCA vs басқа проекция (тұрақты болса), rate limit сандары.

## 15. Ашық сұрақтар / тәуекелдер

- Ашық лицензиялы қазақша корпус рұқсат етілген хосттардан табыла ма — M1 басында тексеріледі; табылмаса иесімен шешеміз (желіге хост қосу немесе иесі мәтін береді).
- Docker-in-sandbox осы контейнерде іске қоса ма — M1-дің бірінші тапсырмасы; болмаса e2e sandbox тесттері CI-да жүреді.
- 7M модельдің қазақша болжамдары әлсіз болады — бұл сабаққа жеткілікті (attention заңдылықтары көрінеді), интерфейсте ашық айтылады.
