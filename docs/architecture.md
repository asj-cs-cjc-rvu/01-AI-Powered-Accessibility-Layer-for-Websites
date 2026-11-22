
# StudyLens Technical Architecture

## 1. System Overview

StudyLens uses a modular monorepo structure with three main components:

1. **Chrome Extension (Manifest V3):** Handles UI, page interaction, and messaging.
2. **Backend (Node.js + Express):** Handles request validation, AI orchestration, and security.
3. **Shared Contracts:** Defines typed APIs and runtime validation for communication.

## 2. Component Responsibilities

| Component | Technology | Responsibility |
|---|---|---|
| Extension UI | React + TypeScript | Side Panel interface, loading states, result display |
| Content Script | TypeScript | Detects text selection and extracts webpage content |
| Background Service Worker | TypeScript | Routes messages between content script and backend |
| Backend API | Node.js + Express | Validates requests and manages AI processing |
| AI Adapter | TypeScript | Abstracts AI provider details behind a common interface |
| Shared Contracts | TypeScript | Maintains request/response types and runtime validation |

## 3. Data Flow

```mermaid
sequenceDiagram
    participant User as Learner
    participant Page as Webpage
    participant CS as Content Script
    participant BG as Background Service Worker
    participant BE as Backend API
    participant AI as AI Provider

    User->>Page: Selects text
    Page->>CS: Selection event
    CS->>BG: Send selected text and action
    BG->>BE: POST /api/v1/process
    BE->>BE: Validate request
    BE->>AI: Forward validated request
    AI->>BE: Return structured result
    BE->>BG: Return JSON response
    BG->>CS: Forward result
    CS->>User: Display result in Side Panel
```

## 4. Current Implementation Boundary

Implemented in Phase 0:

- Shared TypeScript request and response contracts.
- Shared runtime request validation.
- Express backend health endpoint.
- Express processing endpoint with validation.
- Request ID handling.
- Metadata-only request logging.
- Development environment configuration.

Not implemented yet:

- Chrome Manifest V3 configuration.
- Side Panel UI.
- Content Script.
- Background Service Worker.
- AI provider integration.
- Database or request history.
- Speech and reading-view functionality.

## 5. Repository Structure

```text
studylens/
├── docs/
│   ├── decisions/
│   ├── product-requirements.md
│   ├── architecture.md
│   ├── api-contract.md
│   ├── privacy-security.md
│   ├── setup-and-demo.md
│   └── phase-0-completion-report.md
├── extension/
│   └── scripts/
├── backend/
│   └── src/
│       └── server.ts
├── shared/
│   └── src/
│       ├── contracts/
│       └── tests/
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.base.json
```

## 6. Privacy and Security

- Only the text required for the requested action should be transmitted.
- Raw webpage text must not be stored by default.
- API keys must remain on the backend.
- Webpage content must be treated as untrusted input.
- AI-generated scripts and HTML must never be executed directly.
- Request logs must contain metadata only, never submitted text or model output.
- Chrome permissions must be limited to the actual extension requirements.

## Implemented extension components (Phase 1)

| File | Responsibility |
| --- | --- |
| `extension/public/manifest.json` | MV3 config: action, side panel, background worker, content-script matches, permissions |
| `extension/src/background/service-worker.ts` | Resolves the active tab, checks URL support, routes capture requests, opens the side panel |
| `extension/src/content/selection.ts` | Thin browser wrapper: reads `window.getSelection()`, answers `CAPTURE_SELECTION` |
| `extension/src/content/capture.ts` | Pure logic: trim, 5000-char truncation, `SourceInfo` construction. No browser globals. |
| `extension/src/types/messages.ts` | Message constants, payload types, runtime type guards, URL support check |
| `extension/src/sidepanel/App.tsx` | React UI: idle / loading / empty / error / ready states, plain-text rendering |

### Actual message flow

```mermaid
sequenceDiagram
    participant U as User
    participant P as React Side Panel
    participant B as Background Service Worker
    participant C as Content Script
    participant W as Webpage

    U->>W: Selects text
    U->>B: Clicks toolbar icon
    B->>P: sidePanel.open({windowId})
    P->>B: REQUEST_SELECTION
    B->>B: tabs.query(active, currentWindow)
    B->>B: isSupportedUrl(tab.url)
    B->>C: CAPTURE_SELECTION (explicit tabId)
    C->>W: window.getSelection()
    C->>C: buildSelection(text, title, url)
    C-->>B: {success:true, payload}
    B-->>P: SelectionResponse via sendResponse
    P->>U: Renders plain text + metadata
```

### Build architecture

Two independent Vite passes, because Chrome runs content scripts as **classic scripts** but requires the service worker to be an **ES module**:

| Pass | Config | Input | Format | Output |
| --- | --- | --- | --- | --- |
| App | `vite.config.ts` | side panel HTML + background TS | ESM | `sidepanel.js`, `background.js`, assets, copies `manifest.json` |
| Content | `vite.content.config.ts` | `selection.ts` only | IIFE | self-contained `content.js`, no imports |

The content pass sets `emptyOutDir: false` and `copyPublicDir: false` so it does not erase the app output.

## Implemented provider boundary (Phase 2)

```mermaid
flowchart LR
    EXT[Chrome Extension<br/>BackendClient] -->|POST /api/v1/process| RT[Express Route<br/>validateProcessRequest]
    RT --> IF[AiProvider interface<br/>returns shared ProcessResult]
    IF --> GQ[GroqProvider<br/>qwen/qwen3.8-27b]
    IF --> MK[MockProvider<br/>offline, deterministic]
    GQ -->|Bearer token, backend only| API[Groq Cloud<br/>/openai/v1/chat/completions]
```

| File | Responsibility |
| --- | --- |
| `backend/src/config/env.ts` | Loads and validates env; `describeConfig()` emits no secrets |
| `backend/src/ai/provider.interface.ts` | `AiProvider` + `ProviderRequest`; provider-independent |
| `backend/src/ai/provider.factory.ts` | Selects provider from `AI_PROVIDER` |
| `backend/src/ai/providers/groq.provider.ts` | Groq HTTP call, timeout, retries, response normalization |
| `backend/src/ai/providers/mock.provider.ts` | Offline provider for tests and dev |
| `backend/src/ai/errors/provider.errors.ts` | `ProviderError` with fixed safe messages and contract-code mapping |
| `backend/src/routes/process.ts` | Validation + Phase 2 placeholder; provider injected but not yet called |
| `extension/src/services/backend.ts` | `BackendClient` with health/process, offline/timeout/bad-JSON handling |

### Failure mapping (adapter → shared contract)

| Provider condition | `ProviderFailure` | Contract code | HTTP | Retryable |
| --- | --- | --- | --- | --- |
| Missing key/model | CONFIGURATION | INTERNAL_ERROR | 500 | No |
| 401 / 403 | AUTH | INTERNAL_ERROR | 500 | No |
| 429 | RATE_LIMIT | RATE_LIMITED | 429 | Yes |
| Abort after `AI_TIMEOUT_MS` | TIMEOUT | PROVIDER_TIMEOUT | 504 | Yes |
| 5xx / other non-OK | SERVER | PROVIDER_ERROR | 502 | Yes |
| Unparseable or empty content | MALFORMED | PROVIDER_ERROR | 502 | No |
| Network rejection | NETWORK | PROVIDER_ERROR | 502 | Yes |

Retries: at most `AI_MAX_RETRIES`, linear backoff (250 ms × attempt). Auth and malformed failures never retry.

### Current request flow (Phase 2)
Extension → `POST /api/v1/process` → shared validation → **placeholder `INTERNAL_ERROR`**. The adapter is exercised by unit tests only. Phase 3 connects route → provider.

### Endpoints
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness; reports version `2.0.0` |
| GET | `/api/v1/config` | Safe provider diagnostic (no secrets) |
| POST | `/api/v1/process` | Contract-validated processing (AI pending Phase 3) |

## Phase 3: Simplify Flow Architecture

```mermaid
sequenceDiagram
    participant U as User
    participant P as Side Panel
    participant B as Backend
    participant G as Groq API
    
    U->>P: Select text + Click Simplify
    P->>B: POST /api/v1/process {action, text, source}
    B->>B: Validate request + Build prompt
    B->>G: POST /chat/completions {system+user messages}
    G-->>B: JSON response {text, steps, caveats}
    B->>B: Validate/stripping/truncation
    B-->>P: 200 {success, action, result, requestId}
    P->>U: Render simplified text + Copy button
```

Key Components
- Prompt Registry (prompts/simplify.prompt.ts): Action-specific prompts with safety rules
- Output Validator (validation/result.validation.ts): HTML stripping, length caps, list bounds
- Bound Fetch (services/backend.ts): globalThis.fetch.bind(globalThis) prevents Illegal Invocation
- Detached Server: nohup node ... < /dev/null & prevents suspension in background

