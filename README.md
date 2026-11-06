# TULPAR AI v3.0 — Resilient Multi-Model Router + Original Offline Core

**Website** (after GitHub Pages completes deployment): https://mustafa7677.github.io/AI/

TULPAR AI has two engines: (1) **TULPAR Core** — our own small offline assistant, not a full-scale generative LLM, and (2) an **optional Cloudflare Worker gateway** to multiple real cloud AI models. The website switches provider on rate limits (429), availability errors, upstream timeouts or empty responses. When no cloud model is available, **Auto** mode explicitly falls back to the offline assistant; **Cloud** mode surfaces the error instead. **Local** mode stays offline. Cloud provider inference requires credentials, and the model vendors may charge you.

## What changed in v3.0

- **Stop generation:** cancels the active browser request without silently falling back to a different provider.
- **Retry the most recent answer:** removes only the latest user/assistant pair from local history, then resends the user prompt.
- **Explainable model routing:** chat now shows the selected provider and previous failed attempts (such as Groq 429 → Gemini).
- **More resilient streaming:** separate startup and idle timeouts, automatic failover for 429/5xx and empty first responses, readable interruption after content starts.
- **Local backup import:** export chat history and import a validated JSON backup on a different device. Import replaces existing local chats after a confirmation. Keep backups private.
- **Mobile PWA cache refresh:** v3 versioned service worker, network-first page navigation, no HTML fallback for JS assets.
- **23 local automated tests** using mocked cloud providers and offline TULPAR Core.

## Models and priority

The gateway supports nine independent configurable providers:

1. Groq (`GROQ_API_KEY`, `GROQ_MODEL`, default `openai/gpt-oss-120b`)
2. Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL`)
3. OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, default `openrouter/free`)
4. Mistral (`MISTRAL_API_KEY`, `MISTRAL_MODEL`)
5. DeepSeek (`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`)
6. OpenAI (`OPENAI_API_KEY`, `OPENAI_MODEL`)
7. Together (`TOGETHER_API_KEY`, `TOGETHER_MODEL`)
8. Cerebras (`CEREBRAS_API_KEY`, `CEREBRAS_MODEL`)
9. Fireworks (`FIREWORKS_API_KEY`, `FIREWORKS_MODEL`)

Only configured providers are tried, in `MODEL_PRIORITY` order. Providers have different model names, prices and quotas; update model identifiers when providers change their offerings. A provider without API credentials is **not** active. If provider streaming fails *after tokens have been delivered*, TULPAR **does not splice** an unrelated model's output into the same answer. It tells the user to retry.

## Deploy in two layers

### 1. Website (GitHub Pages)

GitHub → Settings → Pages → Deploy from branch → `main` → `/(root)`. The public PWA works in **Local mode without credentials**. GitHub Pages **cannot run a server** or hide cloud API keys.

### 2. Secure Cloudflare Worker (required for multi-model cloud chat)

You need a Cloudflare account and at least one real provider API key. **Never put any vendor API key inside GitHub, the frontend or the URL.** Install Node 20+:

```sh
cd server
npx wrangler login
npx wrangler secret put TULPAR_ACCESS_TOKEN
npx wrangler secret put GROQ_API_KEY
# Optional additional providers:
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put MISTRAL_API_KEY
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TOGETHER_API_KEY
npx wrangler secret put CEREBRAS_API_KEY
npx wrangler secret put FIREWORKS_API_KEY
npx wrangler deploy
```

Set `TULPAR_ACCESS_TOKEN` to a **random 32+ character secret**, distinct from provider keys. Configure at least **one** provider. The Worker URL returned by Wrangler should look like `https://tulpar-ai-gateway.<your-account>.workers.dev`. In the site's **Settings** enter that URL **and the TULPAR access token**, then select **Auto** and click **Save and test**. The URL persists in browser localStorage; the access token persists only within that browser tab's sessionStorage. Cloud chat messages are sent to the Worker and then to the selected model provider.

**Security:** The Worker rejects requests from unapproved browser origins, requires an owner access token, validates message size and roles, returns only safe metadata, and never returns provider secrets. Configure `ALLOWED_ORIGINS` in `server/wrangler.toml` to include your production GitHub Pages origin (default is `https://mustafa7677.github.io`). An origin allowlist is not authentication: keep your access token private. For a public multi-user service, replace the owner token with authenticated users and add per-user quotas, Cloudflare WAF and real rate limits (an optional `RATE_LIMITER` binding is documented in `wrangler.toml`).

### Test

```sh
npm test
python3 -m http.server 8080
```

The 23 tests simulate a rate-limited provider, fallback after 5xx and empty responses, startup and idle streaming, cancel, CORS, access control, JSON backup validation and offline TULPAR Core. They **do not** verify live model calls without actual credentials. This repo does **not** contain secrets or deploy a Worker automatically.

## Privacy and capabilities

TULPAR Core (`core.mjs`) still supports Kazakh/Russian/English, safe arithmetic, local retrievable knowledge, teachable Q&A, document text extraction and local chat history. The cloud gateway supports streamed text chat, model failover, visible route diagnostics and client cancellation. **Image generation, live web search, remote vision, multimodal uploads and universal provider support are not enabled by this router.** PDF text extraction depends on PDF.js, and browser speech recognition is subject to browser/device support. Important answers may be inaccurate. Sensitive chats should not be entered into third-party model services without reviewing their privacy terms.

Copyright (c) 2026 TULPAR AI contributors.

## Troubleshooting GitHub Pages

The static site is deployed separately from the Worker. GitHub's Pages builds and deployments appear under **Actions → pages build and deployment**. If `build` succeeds but `deploy` fails with `Deployment failed, try again later`, the artifact was built; that error does not by itself prove a JavaScript problem. Retry the failed GitHub Actions run or check GitHub Pages platform status. Do not enter `mustafa7677.github.io/AI/` as a **Custom domain**. Leave Custom domain blank. Select `main` and `/ (root)` under Pages settings.

For production, use dedicated per-user authentication, enforce server-side abuse quotas and spending caps, rotate compromised tokens, and protect API credentials only within the Worker. A public GitHub Pages front end cannot hide API keys.
