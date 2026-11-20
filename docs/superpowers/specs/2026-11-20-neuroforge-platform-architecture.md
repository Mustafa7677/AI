# NeuroForge AI — Толық платформа архитектурасы

Күні: 2026-11-20 · Мәртебе: бекітуді күтуде
Байланысты: `2026-11-20-neuroforge-design.md` (Milestone 1 детальдары, ресурс бағалауы §12).
Негіз: иесінің «Technical Requirements» (TR §1–10) және «3D Interactive Learning Experience» (LX §1–10) құжаттары.

## 0. Принциптер

1. **Шынайы есептеу немесе ашық белгі.** Әр метрика, лог, progress backend деректерінен келеді. Симуляция бар жерде UI `SIMULATION` бейджін көрсетеді (TR AC9). Mock тек тесттерде.
2. **Claude-ты көшірмейміз.** Ассистент сапасы алдымен қуатты сыртқы және open-weight модельдерден келеді. Өз модельдеріміз кезеңмен өседі. Әр модельдің нақты өлшемі мен көзі UI-да жазылады.
3. **Модульдік монолит → сервистер.** Бір FastAPI кодбазасы, домендерге бөлінген (bounded contexts). Ауыр бөліктер (inference, training, sandbox) бастан бөлек процестер. Кейін жеке сервиске шығару — интерфейстер арқылы.
4. **Бір дизайн тілі** («Neural Universe»), бір компонент жүйесі. 3D — оқыту құралы, безендіру емес.

## 1. Жүйелік архитектура

```
                         ┌──────────── Web (Next.js, R3F) ─────────────┐
                         │ Academy · Lesson Player · Assistant · Studio │
                         │ Hub · Deploy console · Admin                 │
                         └───────────────┬──────────────────────────────┘
                                         │ HTTPS (REST + SSE/WebSocket)
                              ┌──────────▼──────────┐
                              │  API Gateway/Ingress │  rate limit, WAF, TLS
                              └──────────┬──────────┘
        ┌────────────────────────────────┼─────────────────────────────────┐
        │                     Core API (FastAPI, modular monolith)          │
        │ identity · academy · assistant · files/rag · workspace · studio   │
        │ training · evaluation · deployment · hub · quotas · audit         │
        └──┬──────────┬────────────┬──────────────┬─────────────┬──────────┘
           │          │            │              │             │
     Postgres+    Redis (cache,  Object store   Job orchestrator  Model gateway
     pgvector     queues, pubsub) (S3/MinIO)    (RQ → K8s Jobs)   (provider router)
                                                  │                  │
                   ┌──────────────────────────────┼───────────┐      ├─ external: Anthropic, OpenAI,
                   │                              │           │      │  Gemini, Mistral, … (кілтпен)
             CPU workers                    GPU workers   Sandbox    └─ self-hosted: vLLM pods
             (ingest, tokenizer,            (pretrain,    runner        (open-weight + LoRA,
              dataset jobs, eval)           SFT, LoRA,    (gVisor/       пайдаланушы модельдері)
                                            eval, torchrun) Docker)
        Observability: OpenTelemetry → Prometheus/Grafana, Loki (logs), Sentry, DCGM (GPU)
```

**Процестер (deployables):** `web`, `api`, `worker-cpu`, `worker-gpu`, `sandbox-runner`, `inference-vllm` (әр жарияланған модель/база үшін), `scheduler` (cron: квоталар, тазалау).

**Негізгі шешімдер (менің call-дарым):**
- Job orchestration: dev/M1–M3 — RQ; M5-тен — Kubernetes Jobs (Kubeflow Training Operator `PyTorchJob`, distributed training үшін torchrun). Оркестратор интерфейсі `JobBackend` арқылы ауыстырылады.
- Experiment tracking: өз кестелеріміз (UI-ға тікелей енеді). MLflow-ға экспорт — опция.
- RAG векторлары: pgvector (бір дерекқор, ауқым өскенде бөлек vector DB).
- Sandbox: dev — Docker (`--network none` т.б.), prod — gVisor (`runsc`) runtime + K8s ресурс шегі.
- Real-time: SSE (чат, метрикалар, логтар); WebSocket тек Coding Workspace терминалы үшін.

## 2. Домендер (bounded contexts)

| Домен | Жауапкершілігі | TR/LX |
|---|---|---|
| identity | тіркелу, сессия, OAuth, рөлдер (student, creator, teacher, admin), ұйымдар | TR §7 Security |
| academy | курстар, модульдер, сабақтар, қадамдар, жаттығулар, грейдинг, прогресс, білім картасы, сертификат | TR §5, LX §3–5 |
| tutor | сабақ контекстін түсінетін AI Tutor, кеңестер, code review, бейімделгіш жаттығулар | LX §6 |
| assistant | чат, жобалар, тарих, модель таңдау, параметрлер, құралдар/агенттер | TR §3 |
| files/rag | upload, парсинг (PDF/DOCX/TXT/CSV/MD/code), chunk, embedding, іздеу, дәйексөз | TR §3 File Intelligence |
| workspace | Coding Workspace: жоба файлдары, редактор, sandbox орындау, терминал | TR §3 Coding |
| studio | datasets (версия, сапа), tokenizers, architectures (конфиг, параметр саны, визуализация, PyTorch экспорт) | TR §4.1–4.3 |
| training | pretrain/SFT/LoRA/QLoRA runs, checkpoint, LR schedule, GPU мониторинг, logs, метрикалар, эксперименттер | TR §4.4 |
| evaluation | бенчмарк жиындары, eval runs, салыстыру | TR §4.5 |
| deployment | model registry, endpoints, API кілттер, usage, мониторинг | TR §4.6 |
| hub | модель/дерек репозиторийлері, model cards, public/private, бөлісу, портфолио, қоғамдастық жобалары | TR §6 |
| quotas/billing | ресурс квоталары (GPU-сағат, токен, сақтау), кейін төлем | TR §7 Resource limits |
| audit | маңызды әрекеттер журналы | TR §7 Audit logs |

## 3. Дерекқор сызбасы (Postgres 16 + pgvector)

Барлық кестеде: `id uuid pk` (басқаша айтылмаса), `created_at`, `updated_at`. `owner_id` бар ресурстарда `visibility ['private'|'org'|'public']`. Көп жалдаушылық — `org_id` (nullable, жеке пайдаланушыда null).

**identity**
```
users(email citext uq, password_hash, display_name, locale, role, avatar_uri, email_verified_at)
oauth_accounts(user_id, provider, provider_user_id, uq(provider,provider_user_id))
sessions(user_id, token_hash uq, expires_at, ip, user_agent)
orgs(name, slug uq, plan)
org_members(org_id, user_id, role ['owner'|'admin'|'teacher'|'member'], pk(org_id,user_id))
api_keys(owner_id, org_id, name, key_hash uq, prefix, scopes text[], last_used_at, revoked_at)
```

**academy / tutor**
```
courses(slug uq, title, summary, region ['fundamentals'|'math'|'nn'|'dl'|'transformers'|'llm'|'finetune'|'agents'|'research'], order, version)
modules(course_id, slug, title, order)                       -- TR §5 14 модуль
lessons(module_id, slug, title, content_path, version, est_minutes, order)
lesson_steps(lesson_id, key, kind ['lecture'|'visual'|'explore'|'code_along'|'pset'|'lab'|'project'|'evaluation'], order)
exercises(lesson_id, key, kind ['code'|'quiz'|'lab'|'project'], max_score, grader jsonb, version)
prerequisites(lesson_id, requires_lesson_id)
enrollments(user_id, course_id, started_at, completed_at)
lesson_progress(user_id, lesson_id, current_step, completed_steps text[], completed_at, pk(user_id,lesson_id))
submissions(user_id, exercise_id, exercise_version, payload jsonb, status, score, result jsonb, sandbox_run_id, finished_at)
certificates(user_id, course_id, serial uq, issued_at)
classes(org_id, teacher_id, name, join_code uq, active) · class_members(class_id, user_id)
tutor_threads(user_id, lesson_id, step_key) · tutor_messages(thread_id, role, content, scene_ref jsonb, model_ref, tokens_in, tokens_out)
```

**assistant / files / rag**
```
projects(owner_id, org_id, name, description, system_prompt, default_model_ref, visibility)
conversations(project_id null, owner_id, title, model_ref, params jsonb, archived_at)
messages(conversation_id, role ['user'|'assistant'|'tool'|'system'], content jsonb, model_ref, tokens_in, tokens_out, latency_ms, parent_id)
tool_calls(message_id, tool_name, arguments jsonb, status ['proposed'|'approved'|'running'|'done'|'denied'|'error'], result jsonb, approved_by)
tools(owner_id, name uq-per-owner, kind ['builtin'|'http'|'mcp'], schema jsonb, config_secret_ref, requires_approval bool)
agents(owner_id, project_id, name, instructions, tool_ids uuid[], max_steps, budget_tokens)
agent_runs(agent_id, conversation_id, status, steps jsonb, tokens, cost_usd)
files(owner_id, project_id null, name, mime, size_bytes, sha256, uri, status ['uploaded'|'parsing'|'indexed'|'failed'], pages int)
document_chunks(file_id, ordinal, text, page, char_start, char_end, tokens, embedding vector(1024), ivfflat/hnsw index)
citations(message_id, chunk_id, quote, score)
```

**workspace**
```
workspaces(owner_id, project_id, name, runtime ['python3.12'|'node22'], visibility)
workspace_files(workspace_id, path, content_uri, sha256, size_bytes, uq(workspace_id,path))
sandbox_runs(owner_id, workspace_id null, submission_id null, image, command, status, exit_code, stdout_uri, stderr_uri,
             cpu_ms, mem_peak_mb, wall_ms, limits jsonb)
```

**studio**
```
datasets(owner_id, org_id, name, description, task ['pretrain'|'sft'|'preference'|'eval'], license, visibility)
dataset_versions(dataset_id, version int, uri, num_records, num_tokens, sha256, stats jsonb, quality jsonb,
                 splits jsonb, parent_version_id, pipeline jsonb, status)          -- dedup/validation қадамдары
dataset_jobs(dataset_version_id, kind ['ingest'|'clean'|'dedup'|'validate'|'split'|'tokenize'], status, log_uri, metrics jsonb)
tokenizers(owner_id, name, algorithm ['bpe'|'unigram'|'wordpiece'|'byte'], vocab_size, trained_on_dataset_version_id,
           uri, stats jsonb, status)
architectures(owner_id, name, family ['decoder_only'], config jsonb, params_count bigint, flops_per_token bigint,
              tokenizer_id, exported_code_uri, version int)
```

**training / evaluation / deployment**
```
experiments(owner_id, project_id null, name, description)
training_runs(experiment_id, owner_id, kind ['pretrain'|'sft'|'lora'|'qlora'], base_model_id null, architecture_id null,
              dataset_version_id, tokenizer_id, hyperparams jsonb, resources jsonb, backend ['rq'|'k8s'], status,
              queued_at, started_at, finished_at, error, gpu_hours real, cost_usd real)
training_metrics(run_id, step, split, name, value, ts, pk(run_id,step,split,name))       -- timescale/partition кейін
training_logs(run_id, ts, level, message)                                               -- үлкені Loki-да
gpu_samples(run_id, node, gpu_index, ts, util_pct, mem_used_mb, power_w, temp_c)
checkpoints(run_id, step, uri, sha256, size_bytes, metrics jsonb, is_best bool)
models(owner_id, org_id, name, slug, kind ['own'|'open_weight'|'external'], source jsonb, architecture_id null,
       visibility, card_md, license)
model_versions(model_id, version int, checkpoint_id null, adapter_uri null, base_model_version_id null,
               params_count, context_len, status ['draft'|'ready'|'deprecated'], uq(model_id,version))
benchmarks(name uq, category ['reasoning'|'coding'|'language'|'hallucination'|'safety'|'custom'], language, uri, metric, version)
eval_runs(model_version_id, benchmark_id, status, results jsonb, score real, samples_uri, started_at, finished_at)
deployments(model_version_id, owner_id, name, slug uq, engine ['vllm'|'nfcore'], replicas, hardware, status,
            endpoint_url, visibility, rate_limit jsonb)
usage_records(deployment_id null, api_key_id null, user_id, kind ['chat'|'inference'|'training'|'sandbox'|'storage'],
              tokens_in, tokens_out, gpu_seconds, cost_usd, ts)                                -- партиция айлар бойынша
```

**hub / quotas / audit**
```
stars(user_id, target_type, target_id) · forks(source_type, source_id, fork_id)
shares(target_type, target_id, grantee_user_id|grantee_org_id, permission ['read'|'write'|'admin'])
portfolio_items(user_id, target_type, target_id, pinned_order)
community_projects(owner_id, title, summary_md, links jsonb, model_ids uuid[], dataset_ids uuid[])
quotas(subject_type ['user'|'org'], subject_id, resource, limit_value, period, used_value, resets_at)
audit_log(actor_id, actor_ip, action, target_type, target_id, metadata jsonb, ts)        -- append-only
```

## 4. API дизайны (`/api/v1`, REST + SSE)

Жалпы: cookie сессия (web) немесе `Authorization: Bearer nf_…` (API кілт); пагинация `?cursor=&limit=`; қате `{error:{code,message,details}}`; ұзақ әрекеттер `202 + {job_id}`, күйі `GET` немесе SSE; idempotency `Idempotency-Key` header.

| Домен | Endpoint-тер |
|---|---|
| identity | `POST /auth/{register,login,logout,oauth/{provider}}`, `GET /me`, `CRUD /orgs`, `/orgs/{id}/members`, `CRUD /api-keys` |
| academy | `GET /courses`, `/courses/{slug}`, `/lessons/{id}`, `PUT /lessons/{id}/progress`, `POST /exercises/{id}/submissions`, `GET /submissions/{id}[/stream]`, `GET /me/map` (білім картасы), `GET /me/certificates`, `CRUD /classes`, `POST /classes/join` |
| tutor | `POST /tutor/threads`, `POST /tutor/threads/{id}/messages` (SSE; body ішінде `{lesson_id, step_key, scene_state, code}`) |
| assistant | `CRUD /projects`, `CRUD /conversations`, `POST /conversations/{id}/messages` (SSE: `token`, `tool_call`, `citation`, `done`), `POST /tool-calls/{id}/{approve,deny}`, `GET /models/available`, `CRUD /tools`, `CRUD /agents`, `POST /agents/{id}/runs` |
| files/rag | `POST /files` (multipart/presigned), `GET /files/{id}`, `POST /search` `{query, file_ids|project_id, k}` → chunks + page |
| workspace | `CRUD /workspaces`, `PUT/GET/DELETE /workspaces/{id}/files/{path}`, `POST /workspaces/{id}/run`, `WS /workspaces/{id}/terminal` |
| studio | `CRUD /datasets`, `POST /datasets/{id}/versions` (upload), `POST /dataset-versions/{id}/jobs` `{kind}`, `GET /dataset-versions/{id}/{stats,quality,preview}`, `CRUD /tokenizers`, `POST /tokenizers/{id}/train`, `POST /tokenizers/{id}/encode`, `CRUD /architectures`, `POST /architectures/validate` → params/flops, `GET /architectures/{id}/export?format=pytorch` |
| training | `CRUD /experiments`, `POST /training-runs` `{kind,…}`, `GET /training-runs/{id}`, `GET /training-runs/{id}/{metrics,logs,gpu}/stream`, `POST /training-runs/{id}/cancel`, `GET /training-runs/{id}/checkpoints`, `POST /training-runs/estimate` (GPU-сағат, құн) |
| evaluation | `GET /benchmarks`, `POST /eval-runs` `{model_version_id, benchmark_ids}`, `GET /eval-runs/{id}`, `GET /compare?versions=a,b` |
| deployment | `CRUD /models`, `POST /models/{id}/versions`, `POST /deployments`, `GET /deployments/{id}/{metrics,usage}`, **публичный inference:** `POST /v1/infer/{slug}/chat/completions` (OpenAI-үйлесімді), `POST /v1/infer/{slug}/introspect` (оқу модельдері) |
| hub | `GET /hub/{models,datasets,projects}?q=`, `POST /{type}/{id}/{star,fork,share}`, `GET /users/{handle}/portfolio` |
| admin/ops | `GET /health`, `GET /admin/{users,jobs,quotas,audit}` |

Құралдарды шақыру (assistant/agents): модель гейтвейі провайдерлерге бірыңғай `tools` схемасын береді. Сыртқы әсері бар құралдар (`requires_approval`) пайдаланушы бекіткенше орындалмайды. Әр қадам `tool_calls` және `audit_log`-ға жазылады.

## 5. UI/UX құрылымы

**Sitemap:**
```
/                      — басты бет: өнімнің шын жұмыс істейтін бөліктеріне кіреберіс (лендинг-витрина емес)
/academy               — Learning World: 9 аймақты интерактив білім картасы (3D-лайт, жылдам, 2D fallback)
/academy/{course}/{lesson} — Lesson Player
/assistant             — чат, жобалар, файлдар, модель/параметр панелі
/workspace/{id}        — Coding Workspace (файлдар, Monaco, терминал, AI)
/studio                — Datasets · Tokenizers · Architectures · Training · Evaluation
/studio/runs/{id}      — нақты метрикалар, логтар, GPU, checkpoint-тер
/deploy                — модельдер, нұсқалар, endpoint-тер, API кілттер, usage
/hub                   — модельдер, деректер, қоғамдастық жобалары; /u/{handle} портфолио
/teach                 — мұғалім: сыныптар, прогресс, бағалар
/settings, /admin
```

**Компонент жүйесі:** токендер (түстер: navy #0B1020, graphite #151A24, electric blue #3B82F6, cyan #22D3EE, violet #8B5CF6; кеңістік, радиус, motion ұзақтығы), примитивтер (Button, Panel, Tabs, Slider, Toggle, Badge, `SimulationBadge`, Toast), ғылыми компоненттер (`TensorView`, `AttentionMatrix`, `MetricChart`, `Formula`, `ParamControl`), 3D пакеті `@nf/scenes` (`<NeuralNetScene>`, `<TransformerScene>`, `<TrainingScene>`, ортақ камера, сахна ауысуы, adaptive quality, `useLessonSync`).

**Lesson Player** — LX §4 бойынша 4 панель + focus mode; сабақ мәтіні ↔ сахна ↔ код бір zustand store арқылы; әр сабақ қадамы LX §3-тегі 8 типтің біріне жатады.

**Assistant** — сол: жобалар/чаттар; орта: хабарлар (markdown, код, дәйексөз чиптері → құжат беті); оң: модель, temperature, контекст файлдары, құралдар; tool call карточкалары «бекіту/бас тарту».

**Studio** — пайплайн көрінісі: Dataset → Tokenizer → Architecture → Training → Evaluation → Deploy; әр кезең бір бет, келесіге «осыдан жалғастыру».

Қолжетімділік: пернетақта навигациясы, контраст ≥ 4.5:1, `prefers-reduced-motion`, WebGL жоқ → 2D, мобильде панельдер табқа айналады.

## 6. AI бөліктері

**Модель гейтвейі:** провайдер адаптерлері (Anthropic, OpenAI, Gemini, Mistral, OpenRouter, …) + self-hosted vLLM (OpenAI-үйлесімді). Failover, cooldown, токен есебі, құн есебі, `model_ref` = `provider:model`. Кілттер тек серверде (secrets manager).

**Ассистент сапасы:** ұзақ контекст — модельдің өз терезесі + ескі хабарларды қорытындылау + жоба файлдарынан RAG. Reasoning/код — қуатты модельдерді таңдау арқылы. kk/en/ru — жүйелік нұсқаулық + тіл анықтау; қазақша сапа eval-да жеке өлшенеді.

**Training стегі:** PyTorch; HF Transformers/Tokenizers/PEFT/TRL (SFT, LoRA, QLoRA — bitsandbytes); өз `nfcore` (оқу модельдері, нөлден pretrain); distributed — torchrun/FSDP; checkpoint → S3; метрикалар → DB (SSE арқылы UI); GPU — DCGM → `gpu_samples`.

**Evaluation:** lm-evaluation-harness тапсырмалары + өз қазақша жиындарымыз (тіл, түсіну); coding — HumanEval/MBPP типті, sandbox-та орындалады (pass@k); hallucination — дереккөзге негізделген QA, дәйексөздің дұрыстығы; safety — red-team промпт жиыны, бас тарту/зиян метрикасы; салыстыру беті.

**Deployment:** vLLM (open-weight + көп LoRA adapter), `nfcore` серверi (оқу модельдері + introspection); нұсқалау, canary, API кілт, rate limit, usage → billing.

## 7. Инфрақұрылым жоспары

| Орта | Құрамы |
|---|---|
| Local dev | docker compose: postgres(+pgvector), redis, minio, api, worker-cpu, web, sandbox (Docker). GPU жоқ — CPU training. |
| Staging | 1 managed K8s кластер; CPU node pool; 1× L4/A10 GPU node (inference + LoRA); managed Postgres/Redis; S3 |
| Production | K8s: `system`, `cpu-workers`, `gpu-inference` (L4/A10G/L40S, autoscale), `gpu-training` (A100/H100, spot + checkpoint/resume), gVisor node pool sandbox үшін; CDN web үшін; WAF; бэкап (Postgres PITR, S3 versioning) |
| CI/CD | GitHub Actions: lint, test, build images, migrations, preview deploy; main → staging; tag → prod |
| Observability | OpenTelemetry трейстер, Prometheus + Grafana (API, queue, GPU), Loki логтары, Sentry қателер, alert-тер |
| Security | argon2id, сессия ротациясы, RBAC + ресурс иелігі тексеруі әр запроста, org оқшаулау, secrets — K8s External Secrets/Vault, sandbox (желісіз, ресурс шегі, gVisor), presigned S3 URL, дерек құпиялылығы (private by default, шифрлау at-rest), audit_log, квоталар, бэкап, тәуелділік сканері |

## 8. Кезеңдер және тексерілетін нәтижелер

TR Phase 1–4 және LX §8 келісімі: LX §8 «алдымен бір толыққанды сабақ» талабын иесі таңдаған тәсіл A бойынша M1 етіп алдық; TR Phase 1 (Core Platform) M2–M3-ке түседі.

| Кезең | TR Phase | Мазмұн | Тексерілетін нәтиже (demo + тест) |
|---|---|---|---|
| **M1** | LX §8 + Phase 2 бөлігі | monorepo, compose, auth, nfcore, sandbox, Transformer сабағы, training run беті | design doc §11 (M1) |
| **M2** | Phase 1 | AI Tutor, модель гейтвейі, Learning World картасы, Neural Network сабағы, пайдаланушы кабинеті | Tutor сабақ сахнасына сілтеп жауап береді; екінші сабақ тек `@nf/scenes` компоненттерінен; AC1 (ішінара) |
| **M3** | Phase 1 | Assistant: стриминг, жобалар, тарих, модель/параметр, файлдар + RAG дәйексөзбен, Model Training сабағы | AC1: нақты модельмен сапалы жауап, құжат бетіне дәйексөз; e2e |
| **M4** | Phase 2 | Dataset Studio, Tokenizer Studio, Architecture Builder (+PyTorch экспорт), пайдаланушы training (CPU), квоталар, experiments | AC2, AC3, AC4, AC5, AC6, AC8: пайдаланушы өз деректерімен моделін оқытып, интерфейсте тексереді |
| **M5** | Phase 3 | GPU workers, K8s Jobs, SFT/LoRA/QLoRA, GPU мониторинг, evaluation, deployment (vLLM, API кілттер, usage) | AC4 (GPU), AC7: fine-tune → eval салыстыру → REST endpoint, usage жазылады |
| **M6** | Phase 3 | Model Hub, model cards, бөлісу, портфолио, қоғамдастық, Coding Workspace, agents/tools | модельді бөлісу/fork; агент бекітілген құралмен көпқадамды тапсырма орындайды |
| **M7+** | Phase 4 | дербес архитектуралар, үлкен pretrain, distributed training зерттеуі | бюджет пен команда бекітілгеннен кейін жеке жоспар (design doc §12) |
| Академия | қатар | TR §5 14 модуль мазмұны, әр модульде LX §3 8 бөлім | әр кезеңде кемінде 1–2 толық сабақ қосылады |

## 9. Acceptance criteria бақылау кестесі

| AC | Қай кезеңде | Қалай дәлелденеді |
|---|---|---|
| 1 Ассистент нақты модельмен сапалы жауап | M3 (M2 ішінара) | e2e + eval жиыны (kk/en/ru) |
| 2 Жоба ашып, dataset жүктеу | M4 | e2e: upload → version → stats |
| 3 Architecture Builder нақты конфиг | M4 | конфиг → `nfcore` моделі құрылады, параметр саны тестпен сәйкес |
| 4 Шынайы GPU/CPU training | M1 (CPU), M5 (GPU) | overfit тесті, loss қисығы DB-ден |
| 5 Салмақтар мен checkpoint сақталады | M1 | S3-те sha256, load → бірдей шығыс |
| 6 Оқытылған модельді интерфейсте тексеру | M1 | сабақта/Studio-да таңдалған checkpoint-пен inference |
| 7 Модельді API ретінде жариялау | M5 (M1-де `/introspect` ішкі) | API кілтпен `curl` → жауап, usage жазылады |
| 8 Прогресс/метрика/лог backend-тен | M1-ден бастап | UI тек API-дан оқиды; тест: DB-ге жазылған мән UI-да |
| 9 Mock/simulation анық ажыратылған | M1-ден бастап | `SimulationBadge`, анти-мақсаттар тізімі, review checklist |
| 10 Үлкен модельдерге ресурс жоспары | дайын | design doc §12, M5-те өлшеммен жаңартылады |

## 10. Тәуекелдер

- Қазақша сапалы деректер аз — Phase 4-тің негізгі шектеуі; M4-тен бастап дерек жинау/лицензиялау жоспары керек.
- GPU құны — квоталар, spot, бюджет алерттері.
- Сыртқы провайдерлерге тәуелділік (M2–M3) — гейтвей арқылы ауыстырылады, open-weight self-host M5.
- Мазмұн көлемі (14 модуль × 8 бөлім) — ең ұзақ жұмыс; сабақ шаблоны мен компоненттер M1–M2-де қатаяды.
- Бір әзірлеуші жылдамдығы — әр кезең жұмыс істейтін өнімге аяқталады, келесісі соған құрылады.
