# NeuroForge AI

Қазақтілді интерактив AI инженерия университеті мен платформасы: ИИ-дың ішкі құрылысын
көріп, өз қолыңмен токенизатор, transformer құрып, нақты оқытып, жариялау.

- Жалпы архитектура: `../docs/superpowers/specs/2026-11-20-neuroforge-platform-architecture.md`
- Milestone 1 дизайны: `../docs/superpowers/specs/2026-11-20-neuroforge-design.md`

## Құрылым

```
packages/nfcore/   Python кітапхана: BPE токенизатор, GPT, нақты training, checkpoint, introspection
services/api/      FastAPI (M1b)
services/worker/   training және code-run jobs (M1b)
sandbox/           пайдаланушы кодына арналған оқшау Docker image (M1b)
apps/web/          Next.js + React Three Fiber сабақ ойнатқышы (M1c)
content/lessons/   MDX сабақтар (M1c)
infra/             docker compose (M1b)
```

## Даму

```sh
cd neuroforge
python3 -m venv .venv
.venv/bin/pip install -e "packages/nfcore[dev]"
cd packages/nfcore && ../../.venv/bin/python -m pytest -q
```

## Принцип

Барлық метрика, loss, progress нақты есептеуден келеді. Оқу модельдері интерфейсте әрқашан
«оқу моделі» деп, нақты параметр санымен белгіленеді — олар Claude/ChatGPT баламасы емес.
