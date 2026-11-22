# StudyLens API Contract (v1)

Status: **Canonical**. Implemented in `shared/src/contracts/api.ts`.
Rule: this document and that file must always agree. Change both in the same commit.

## 1. Endpoints

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| GET | `/health` | Liveness check | Implemented |
| POST | `/api/v1/process` | Single processing endpoint for all actions | Validation implemented; AI processing NOT implemented (Phase 2 / M3) |

Base URL comes from configuration (`BACKEND_BASE_URL`), never hardcoded per-file.
Local default: `http://localhost:3000`.

Content type: `application/json` for request and response.

## 2. Request schema — `POST /api/v1/process`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `action` | `"simplify" \| "explain" \| "translate" \| "steps"` | Yes | Exactly one of the four values. |
| `text` | string | Yes | Trimmed server-side. Non-empty after trim. Max **5000** characters after trim. |
| `source` | object | Yes | See below. |
| `source.type` | `"selection" \| "page"` | Yes | Which content the learner acted on. |
| `source.pageTitle` | string | No | Page title, if available. |
| `source.pageUrl` | string | No | Page URL, if available. |
| `source.truncated` | boolean | No | `true` when the extension cut the text to fit the limit. |
| `targetLanguage` | `"en" \| "hi" \| "kn"` | **Required for `translate`**; optional otherwise | Defaults to `"en"` when omitted for non-translate actions. |

TypeScript shape (discriminated union — `translate` cannot compile without `targetLanguage`):

```ts
type ProcessRequest = SimplifyRequest | ExplainRequest | StepsRequest | TranslateRequest;
```

### 2.1 Translation language rules (explicit)
- Supported target languages: `en` (English), `hi` (Hindi), `kn` (Kannada). No others.
- `action: "translate"` **without** `targetLanguage` → `400 INVALID_INPUT`.
- `targetLanguage` outside the supported set (any action) → `400 UNSUPPORTED_LANGUAGE`.
- For `simplify` / `explain` / `steps`, omitting `targetLanguage` means `en`.
- The response always echoes the language actually used in `result.language`.

## 3. Validation rules (order of evaluation)

1. Body must be a JSON object (not array/null/scalar) → `INVALID_INPUT`.
2. `action` present and supported → `INVALID_INPUT`.
3. `text` is a string → `INVALID_INPUT`.
4. `text.trim()` non-empty → `INVALID_INPUT`.
5. `text.trim().length <= 5000` → `TEXT_TOO_LONG`.
6. `source` is an object and `source.type` is `selection` or `page` → `INVALID_INPUT`.
7. Optional `source` fields have correct types → `INVALID_INPUT`.
8. `targetLanguage`, if present, is supported → `UNSUPPORTED_LANGUAGE`.
9. `action === "translate"` requires `targetLanguage` → `INVALID_INPUT`.

Additional transport limits:
- Raw JSON body limit: **64 KiB** (`MAX_BODY_BYTES`). Exceeding it → `413 TEXT_TOO_LONG`.
- Malformed JSON → `400 INVALID_INPUT`.
- Unknown route → `404` with `INVALID_INPUT` body.
- Disallowed browser origin → `400 INVALID_INPUT` ("Origin not allowed.").

## 4. Success response schema

```json
{
  "success": true,
  "action": "simplify",
  "result": {
    "text": "string",
    "language": "en",
    "steps": [],
    "caveats": ["optional string"]
  },
  "requestId": "server-generated-id"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `success` | `true` | Discriminator. |
| `action` | Action | Echoes the request action. |
| `result.text` | string | Generated text. Never empty on success. |
| `result.language` | Language | Language actually produced. |
| `result.steps` | string[] | **Always present.** `[]` unless `action === "steps"`, then ≥ 1 ordered step. |
| `result.caveats` | string[] | Optional. Used when context is insufficient. |
| `requestId` | string | Server-generated UUID; also returned in the `X-Request-Id` header. |

HTTP status: `200`.

## 5. Error response schema

```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Select or provide some text before processing.",
    "details": {}
  },
  "requestId": "server-generated-id"
}
```

`details` is optional and must contain **safe diagnostics only** — never source text or model output.

### 5.1 Supported error codes (decision on `INTERNAL_ERROR`)

`INTERNAL_ERROR` is **retained and documented**. Unexpected server failures need a defined code, and it is also returned while AI processing is unimplemented so the API never fakes success.

| Code | HTTP | Meaning | Client behaviour |
| --- | --- | --- | --- |
| `INVALID_INPUT` | 400 | Malformed body, bad action, empty text, missing translate language, unknown route, disallowed origin | Show validation message; do not retry unchanged. |
| `TEXT_TOO_LONG` | 413 | Text over 5000 chars, or body over 64 KiB | Ask learner to select less text. |
| `UNSUPPORTED_LANGUAGE` | 400 | `targetLanguage` not `en`/`hi`/`kn` | Offer supported languages. |
| `PROVIDER_TIMEOUT` | 504 | AI provider exceeded `AI_TIMEOUT_MS` | Retry allowed. |
| `PROVIDER_ERROR` | 502 | Provider rejected/failed the call | Retry allowed, show AI-error state. |
| `RATE_LIMITED` | 429 | Too many requests | Back off and retry. |
| `INTERNAL_ERROR` | 500 | Unexpected server failure **or feature not yet implemented** | Show generic error; no fake result. |

Emission status (end of Phase 2): `INVALID_INPUT`, `TEXT_TOO_LONG`, `UNSUPPORTED_LANGUAGE`, and `INTERNAL_ERROR` are emitted by the route. `PROVIDER_TIMEOUT`, `PROVIDER_ERROR`, and `RATE_LIMITED` are produced by the Groq adapter and mapped to these codes, but are not yet reachable through `/api/v1/process` because the route still returns the Phase 2 placeholder. They become reachable in Phase 3.

## 6. Request ID handling
- Backend generates a UUID per request and sets `X-Request-Id` on every response (success and error).
- A client may send `X-Request-Id`; the backend accepts it (truncated to 64 chars) for tracing.
- `requestId` appears in the JSON body of both success and error responses.
- Logs contain `requestId`, method, route, status, latency only.

## 7. Timeout and provider-failure behaviour (contract for Phase 2)
- Provider timeout: `AI_TIMEOUT_MS` (default 30000) → `PROVIDER_TIMEOUT` (504).
- Retries: at most `AI_MAX_RETRIES` (default 1), only on timeout/5xx provider errors.
- Validation errors are never retried.
- Provider output must be validated against `ProcessResult` before returning; invalid output → `PROVIDER_ERROR`.
- No placeholder or hardcoded text may ever be returned as a successful AI result.

## 8. Examples — one per action

### 8.1 simplify (valid)
```json
{
  "action": "simplify",
  "text": "Photosynthesis is the process by which green plants synthesise organic compounds using light energy.",
  "source": { "type": "selection", "pageTitle": "Photosynthesis", "pageUrl": "https://example.edu/lesson" }
}
```
Response `200`:
```json
{
  "success": true,
  "action": "simplify",
  "result": { "text": "Plants use sunlight to make their own food.", "language": "en", "steps": [] },
  "requestId": "b1f0c2d4-0000-4000-8000-000000000001"
}
```

### 8.2 explain (valid)
```json
{
  "action": "explain",
  "text": "Chlorophyll absorbs light in the blue and red wavelengths.",
  "source": { "type": "selection", "pageTitle": "Leaf pigments" },
  "targetLanguage": "en"
}
```
Response `200`:
```json
{
  "success": true,
  "action": "explain",
  "result": {
    "text": "Chlorophyll is the green pigment in leaves. It captures mostly blue and red light, and reflects green light, which is why leaves look green.",
    "language": "en",
    "steps": []
  },
  "requestId": "b1f0c2d4-0000-4000-8000-000000000002"
}
```

### 8.3 translate (valid, Kannada)
```json
{
  "action": "translate",
  "text": "The sun rises in the east.",
  "source": { "type": "selection" },
  "targetLanguage": "kn"
}
```
Response `200`:
```json
{
  "success": true,
  "action": "translate",
  "result": { "text": "ಸೂರ್ಯ ಪೂರ್ವದಲ್ಲಿ ಉದಯಿಸುತ್ತಾನೆ.", "language": "kn", "steps": [] },
  "requestId": "b1f0c2d4-0000-4000-8000-000000000003"
}
```

### 8.4 steps (valid)
```json
{
  "action": "steps",
  "text": "To prepare a temporary mount, place the specimen on a slide, add a drop of stain, and lower a coverslip at an angle to avoid air bubbles.",
  "source": { "type": "selection", "pageTitle": "Microscopy lab" }
}
```
Response `200`:
```json
{
  "success": true,
  "action": "steps",
  "result": {
    "text": "Preparing a temporary mount:",
    "language": "en",
    "steps": [
      "Place the specimen on a clean slide.",
      "Add one drop of stain.",
      "Lower a coverslip at an angle so no air bubbles are trapped."
    ]
  },
  "requestId": "b1f0c2d4-0000-4000-8000-000000000004"
}
```

### 8.5 Invalid — empty text
Request: `{ "action": "simplify", "text": "   ", "source": { "type": "selection" } }`
Response `400`:
```json
{ "success": false, "error": { "code": "INVALID_INPUT", "message": "Select or provide some text before processing." }, "requestId": "..." }
```

### 8.6 Invalid — translate without language
Request: `{ "action": "translate", "text": "Hello", "source": { "type": "selection" } }`
Response `400`:
```json
{ "success": false, "error": { "code": "INVALID_INPUT", "message": "targetLanguage is required when action is translate." }, "requestId": "..." }
```

### 8.7 Invalid — unsupported language
Request: `{ "action": "translate", "text": "Hello", "source": { "type": "selection" }, "targetLanguage": "fr" }`
Response `400`:
```json
{ "success": false, "error": { "code": "UNSUPPORTED_LANGUAGE", "message": "targetLanguage must be one of: en, hi, kn." }, "requestId": "..." }
```

### 8.8 Invalid — oversized text
Response `413`:
```json
{ "success": false, "error": { "code": "TEXT_TOO_LONG", "message": "text must be at most 5000 characters after trimming." }, "requestId": "..." }
```

### 8.9 Current Phase 0 behaviour — valid request, AI not wired
Response `500`:
```json
{ "success": false, "error": { "code": "INTERNAL_ERROR", "message": "AI processing is not implemented yet. Scheduled for Phase 2 (M3)." }, "requestId": "..." }
```

## 9. Health endpoint

`GET /health` → `200`
```json
{ "status": "ok", "service": "studylens-backend", "version": "1.0.0", "timestamp": "2026-11-16T06:04:13.394Z" }
```

## 10. CORS
- `chrome-extension://` origins: allowed.
- Requests with no `Origin` header (curl, server-to-server): allowed.
- Other origins: allowed only if listed in `ALLOWED_ORIGINS`.
- Allowed methods: `GET`, `POST`. Allowed headers: `Content-Type`, `X-Request-Id`.

## 11. Provider diagnostic endpoint (Phase 2)

`GET /api/v1/config` → `200`
```json
{
  "provider": "mock",
  "model": null,
  "timeoutMs": 30000,
  "maxRetries": 1,
  "credentialsPresent": false
}
```

| Field | Notes |
| --- | --- |
| `provider` | `"groq"` or `"mock"` |
| `model` | Model ID when provider is `groq`; otherwise `null` |
| `timeoutMs` | From `AI_TIMEOUT_MS` |
| `maxRetries` | From `AI_MAX_RETRIES` |
| `credentialsPresent` | Boolean only, and only meaningful when provider is `groq`. **Never the key value.** |

This endpoint is a development diagnostic. It must never expose credentials, and it should be removed or authenticated before any public deployment.

### Implemented Actions
-   **simplify**: Returns simplified text preserving original meaning. Uses Groq Qwen 3.8 27B.
    -   Input: `{action: "simplify", text: string, source: {...}}`
    -   Output: `{success: true, action: "simplify", result: {text, language, steps, caveats}, requestId}`

### Not Yet Implemented
-   explain, translate, steps, listen (Phase 4)