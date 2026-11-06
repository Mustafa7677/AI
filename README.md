# TULPAR AI — Original Local Engine

**Live site after GitHub Pages is enabled:** https://mustafa7677.github.io/AI/

This is an original **lightweight** AI assistant written from scratch. **It does not use Qwen, a remote LLM API, or pretend to be a ChatGPT-scale model.** The local TULPAR Core provides multilingual intent recognition (Kazakh, Russian, English), trainable question–answer retrieval using character n-gram vectors, safe mathematical expression evaluation, extractive summarisation, local knowledge retrieval from uploaded documents, and private on-device memory. Quality is limited compared with modern pretrained generative language models.

## Features

- Mobile-friendly PWA, light/dark mode, chat history (localStorage)
- Own JS learning/inference engine (`core.mjs`), **no model API key**
- Teachable answers: `Үйрет: сұрақ => жауап`, `Научи: вопрос => ответ`, `Teach: question => answer`
- Remember snippets: `Есте сақта: ...`, `Запомни: ...`, `Remember: ...`
- Basic calculations, study suggestions, project ideas, basic writing/code guidance
- TXT, MD, JSON, CSV document retrieval; PDF text extraction through PDF.js **requires network on first use**
- Browser speech recognition where supported; language selector, dark/light theme
- Local JSON export and wipe controls

## Run & test

No dependency installation is required to run the site:

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

Requires Node 18+ for tests:

```bash
npm test
```

## Publish to GitHub Pages

Repository Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/(root)` → Save. It may take some time to publish. **GitHub Pages only hosts this browser-based version**, not a Python AI server.

## Limitations & privacy

This project **is not a general-purpose generative LLM**: it cannot reliably answer arbitrary knowledge questions, perform accurate translation, recognise image contents, or reason like a frontier model. The app stores chats, memorised facts, learned examples and uploaded document text in this device's localStorage. Do not upload sensitive documents on shared devices. No authentication or cloud sync is present. PDF.js and the optional Google Font are third-party network assets and offline PDF extraction might not work until cached. Browser speech recognition may transmit audio to a device/browser speech service; it is not necessarily offline. The site itself does not transmit chat prompts to our servers.

## Next stages for stronger original AI

1. Curate permissioned Kazakh/Russian/English corpora with evaluation datasets.
2. Implement and train a small transformer language model from scratch (requires GPU compute and sustained engineering).
3. Evaluate, fine-tune and deploy a real inference service with account security and abuse controls.
4. Connect the PWA to the API using signed requests; add explicit consent and data retention controls.

Copyright (c) 2026 TULPAR AI contributors. No additional license granted; contact the author before reuse.
