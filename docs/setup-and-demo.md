# StudyLens — Setup and Demo Guide

## 1. Prerequisites
- Node.js >= 20 (`node -v`)
- npm >= 10 (`npm -v`)
- Git
- Google Chrome (only needed from Phase 1)

## 2. Clone and install

```bash
git clone <repository-url>
cd <repository-folder>
npm install
```

`npm install` at the root installs all three workspaces (`shared`, `backend`, `extension`) and links `@studylens/shared` into the backend.

## 3. Environment setup

```bash
cp .env.example .env
```

The canonical filename is **`.env.example`** (with the leading dot), copied to **`.env`** at the repository root. The backend loads `<repo>/.env` automatically.

Defaults work out of the box: `PORT=3000`, `HOST=0.0.0.0`. No API key is needed yet.

Verify `.env` is ignored:
```bash
git check-ignore -v .env      # should print a .gitignore rule
git status --short            # .env must NOT appear
```

## 3a. AI provider setup

Default is the **mock** provider — no key, no cost, no network:
```text
AI_PROVIDER=mock
```

To use real Groq calls:
1. Create a key at https://console.groq.com/keys
2. In the repository-root `.env` (**never** in `.env.example`):
   ```text
   AI_PROVIDER=groq
   GROQ_API_KEY=your_key_here
   GROQ_MODEL=qwen/qwen3.8-27b
   ```
3. Restart the backend.

`qwen/qwen3.8-27b` is a **preview** model priced at $0.80/1M input and $4.00/1M output tokens. Preview models may be discontinued at short notice. To switch models, change `GROQ_MODEL` and restart — no code change.

List available models:
```bash
curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
```

Verify configuration without exposing the key:
```bash
curl -s http://localhost:3000/api/v1/config
```
Expected with mock: `{"provider":"mock","model":null,"timeoutMs":30000,"maxRetries":1,"credentialsPresent":false}`

## 8a. Phase 2 smoke checks

```bash
# health
curl -s http://localhost:3000/health

# safe provider diagnostic
curl -s http://localhost:3000/api/v1/config

# valid request -> placeholder (correct for Phase 2)
curl -s -X POST http://localhost:3000/api/v1/process \
  -H 'Content-Type: application/json' \
  -d '{"action":"simplify","text":"Plants make food using sunlight.","source":{"type":"selection"}}'

# invalid: empty text -> 400 INVALID_INPUT
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/v1/process \
  -H 'Content-Type: application/json' \
  -d '{"action":"simplify","text":"   ","source":{"type":"selection"}}'

# invalid: translate without language -> 400 INVALID_INPUT
curl -s -X POST http://localhost:3000/api/v1/process \
  -H 'Content-Type: application/json' \
  -d '{"action":"translate","text":"Hello","source":{"type":"selection"}}'
```

Secret hygiene check before every commit:
```bash
git check-ignore -v .env                      # must print a rule
grep -n 'GROQ_API_KEY' .env.example           # must show an empty value
git diff --cached | grep -n 'gsk_'            # only fake test fixtures allowed
```

## 4. Build

```bash
npm run build:baseline
```
Builds `shared` then `backend`. Output goes to `shared/dist` and `backend/dist`.

```bash
npm run build
```
Runs the baseline build **and** the extension build. The extension build exits with code 1 on purpose: the extension is not implemented until Phase 1. A failing exit code here is expected, not a broken environment.

## 4a. Real AI Setup (Phase 3+)

1.  Obtain Groq API key: https://console.groq.com/keys
2.  Edit `.env`:
    ```text
    AI_PROVIDER=groq
    GROQ_API_KEY=your_key_here
    GROQ_MODEL=qwen/qwen3.8-27b
    ```
3.  Start backend: `PORT=3000 nohup node backend/dist/server.js > /tmp/studylens.log 2>&1 < /dev/null &`
4.  Verify: `curl -s http://127.0.0.1:3000/api/v1/config | grep groq`

⚠️ **Warning**: `qwen/qwen3.8-27b` is a **billable preview model** ($0.80/1M input, $4.00/1M output). Monitor usage at console.groq.com.

## 8a. Phase 3 Demo Script

1.  Open https://en.wikipedia.org/wiki/Photosynthesis
2.  Select first Overview paragraph → Capture → Simplify
3.  Verify: Result renders in ~2s, facts preserved, no HTML tags
4.  Click Copy → Paste elsewhere → Confirm exact match
5.  Kill backend: `pkill -f 'node backend/dist/server.js'`
6.  Verify: 🔴 Offline message with exact error detail, Simplify disabled
7.  Restart backend → Verify: 🟢 Connected, Simplify re-enables
8.  Test on Khan Academy + NASA pages for technical/long-text handling

## 9. Load the extension in Chrome — AVAILABLE

```bash
npm run build:extension
```

1. Visit `chrome://extensions/` (Vivaldi: `vivaldi://extensions/`)
2. Toggle **Developer mode** on
3. Click **Load unpacked**, choose `extension/dist`
4. Pin StudyLens to the toolbar
5. Open an educational page, select text, click the icon

**Developing from a Codespace:** the browser cannot load an extension from a remote filesystem. Build in the Codespace, download `extension/dist` to your local machine (VS Code Desktop: right-click the folder → Download), then load that local folder. After each rebuild, reload the extension and refresh the test page.

## 10. Demo script — Phase 1 (runnable today)

1. Open `https://en.wikipedia.org/wiki/Photosynthesis`
2. Select the first paragraph
3. Click the StudyLens toolbar icon
4. Confirm the side panel shows the "Selected text" badge, page title, the paragraph, and a character count
5. Click **Clear selection** → confirm the empty state
6. Select nothing and click **Capture selection** → confirm the "No text selected" fallback
7. Select several long paragraphs (>5000 chars) → confirm the truncation warning
8. Switch to `chrome://extensions` and click the icon → confirm the unsupported-page message

AI features (Simplify, Explain, Translate, Listen, Steps) are not part of this demo yet.

## 11. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `EADDRINUSE ... 3000` | Old server still running | `kill $(lsof -t -i:3000)` then restart |
| `curl: (7) Failed to connect` | Server not running, or run in the same blocking terminal | Start server in Terminal A, curl in Terminal B |
| Browser `ERR_CONNECTION_REFUSED` in Codespaces | Browser is on your laptop, server is remote | Use the forwarded URL from the **Ports** tab |
| `Cannot GET /` | No route at `/` | Use `/health` |
| `TS18003 No inputs were found` | Workspace has no `src` files | Ensure `shared/src` and `backend/src` exist |
| `Cannot find module '@studylens/shared'` | Shared not built or not linked | `npm install` then `npm run build:shared` |
| `npm run build` exits 1 at extension | Expected in Phase 0 | Use `npm run build:baseline` |