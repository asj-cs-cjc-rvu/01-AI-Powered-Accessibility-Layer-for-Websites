# Phase 2 Completion Report — Backend Skeleton, Groq Adapter, Contract Enforcement

Status: **CLOSED ✅** (pending the manual extension↔backend browser check, item 9)
Branch: `rebuild` · Commit: `bfa2356`

## 1. Acceptance checklist

| # | Condition | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Phase 0 and Phase 1 functionality preserved | ✅ | 13 shared + 18 Phase 1 extension tests still pass |
| 2 | Backend health endpoint works | ✅ | `GET /health` → `{"status":"ok","version":"2.0.0"}` |
| 3 | Process endpoint follows shared contract | ✅ | `validateProcessRequest` + `ERROR_HTTP_STATUS`; placeholder retained |
| 4 | Groq configuration is backend-only | ✅ | Key appears once, in the `Authorization` header |
| 5 | Provider-independent interface implemented | ✅ | `AiProvider`; `MockProvider` satisfies it |
| 6 | Groq Qwen adapter implemented | ✅ | `GroqProvider`, model from `GROQ_MODEL` |
| 7 | Timeout and provider error handling tested | ✅ | abort→`PROVIDER_TIMEOUT`, 429→`RATE_LIMITED`, 5xx→`PROVIDER_ERROR` |
| 8 | Extension backend client implemented | ✅ | `BackendClient.health()` / `.process()` |
| 9 | Extension communicates with local backend | ⏳ | Client unit-tested; browser check outstanding |
| 10 | No API key in extension, Git, logs, or responses | ✅ | See §4 incident; `describeConfig` emits a boolean only |
| 11 | All automated tests pass | ✅ | **67/67** |
| 12 | Documentation and report updated | ✅ | This file + ADR-002 + 5 doc updates |

## 2. Automated test results — `npm test`

| Suite | Tests | Pass | Fail |
| --- | --- | --- | --- |
| `@studylens/shared` — API contract | 13 | 13 | 0 |
| `@studylens/backend` — config | 7 | 7 | 0 |
| `@studylens/backend` — groq adapter | 11 | 11 | 0 |
| `@studylens/backend` — normalize | 4 | 4 | 0 |
| `@studylens/backend` — factory | 3 | 3 | 0 |
| `@studylens/extension` — buildSelection | 7 | 7 | 0 |
| `@studylens/extension` — BackendClient | 8 | 8 | 0 |
| `@studylens/extension` — response guards | 3 | 3 | 0 |
| `@studylens/extension` — message guards | 11 | 11 | 0 |
| **Total** | **67** | **67** | **0** |

All provider tests inject `fetchImpl`. **Zero network calls, zero token spend.**

### Required coverage from the brief
| Required test | Covered by |
| --- | --- |
| Health endpoint HTTP 200 | Manual curl + `BackendClient` health test |
| Valid request passes validation | shared suite + manual curl |
| Invalid action → 400 | shared: `invalid action rejected` |
| Empty text → 400 | shared: `empty or whitespace-only text rejected` |
| Oversized text → 413 | shared: `oversized text returns TEXT_TOO_LONG` |
| Missing API key → clear config error | backend: `rejects missing api key` |
| Invalid provider → clear config error | backend: `rejects invalid provider` |
| Provider timeout → normalized error | backend: `maps abort to PROVIDER_TIMEOUT` |
| Provider 429 → rate-limit handling | backend: `maps 429 to RATE_LIMITED` |
| Provider 500 → provider failure | backend: `maps 500 to PROVIDER_ERROR` |
| Malformed provider output rejected | backend: `rejects empty model content`, `rejects malformed json content`, normalize suite |
| Extension backend offline → useful error | extension: `reports OFFLINE when fetch rejects` |
| No API key exposure | backend: `never exposes the key value in describeConfig`, `never puts the api key in the result`, `reports no credentials for mock even if a key is set`; extension: `never sends an Authorization header` |

## 3. Build and endpoint verification

| Command | Result |
| --- | --- |
| `npm run build:baseline` | ✅ shared + backend compile |
| `npm run build:extension` | ✅ app pass (ESM) + content pass (IIFE, 0 imports) |
| `npm run typecheck` | ✅ no errors |

```
GET /health        → {"status":"ok","service":"studylens-backend","version":"2.0.0",...}
GET /api/v1/config → {"provider":"mock","model":null,"timeoutMs":30000,"maxRetries":1,"credentialsPresent":false}
POST /api/v1/process (valid) → 500 {"success":false,"error":{"code":"INTERNAL_ERROR",
                                "message":"AI processing is not implemented yet. Scheduled for Phase 3."}}
```

## 4. Security incident and resolution

**What happened:** a real Groq API key was pasted into `.env.example` (a Git-tracked file) and committed. GitHub push protection rejected the push with `GH013 — Groq API Key at .env.example:17`.

**Impact:** none externally. The push was rejected, so the secret never reached GitHub. Remote `rebuild` remained at `758a2f9` throughout.

**Resolution:**
1. Key rotated at console.groq.com/keys.
2. `GROQ_API_KEY=` blanked in `.env.example`; the new key placed only in the git-ignored `.env`.
3. `git commit --amend` rewrote the offending local commit (`12f3fc3` → `bfa2356`), so no pushed history contains the secret.
4. Push succeeded.

**Detection aid:** `/api/v1/config` reported `credentialsPresent: true` while `provider` was `mock` — an inconsistency that revealed a stray key. `describeConfig` was tightened so the flag is only meaningful for the active provider, and a regression test (`reports no credentials for mock even if a key is set`) now guards it.

**Lessons recorded:**
- Template files are tracked files. Never put a real credential in `.env.example`, even temporarily.
- Do not use GitHub's "allow this secret" unblock link for a live credential.
- Because the push failed, `--amend` was sufficient; a successful push would have required history rewriting.
- Test fixtures use obviously fake values (`gsk_test_key`, `gsk_super_secret`, `gsk_leftover`) so scanners and reviewers can distinguish them from real keys.

## 5. Files added

```
backend/src/config/env.ts
backend/src/ai/provider.interface.ts
backend/src/ai/provider.factory.ts
backend/src/ai/errors/provider.errors.ts
backend/src/ai/providers/groq.provider.ts
backend/src/ai/providers/mock.provider.ts
backend/src/routes/process.ts
backend/tests/ai.test.ts
backend/tsconfig.test.json
extension/src/services/backend.ts
extension/src/services/backend.test.ts
docs/decisions/ADR-002-ai-provider-groq.md
docs/phase-2-completion-report.md
```

## 6. Defects found and fixed during the phase

| Defect | Root cause | Fix |
| --- | --- | --- |
| `TS2694: Namespace has no exported member 'default'` | `ReturnType<typeof import('express').default>` is invalid against `@types/express` | Import `Application` / `Response` as named types |
| Server exited at startup | `.env` had `AI_PROVIDER=groq` with no key | `.env.example` defaults to `mock`; error message states both options |
| `config` implicitly `any` | `let config;` assigned inside `try` | Declared `let config: AppConfig` |
| `credentialsPresent` misleading for mock | Flag read the key regardless of active provider | Conditional on `provider === 'groq'` + regression test |
| Committed API key | Real key placed in a tracked template | Rotated, blanked, amended (see §4) |

## 7. Known limitations carried forward
- `/api/v1/process` performs no AI work; the placeholder remains by design.
- The extension does not yet call the backend from the browser (client is unit-tested only).
- No `json_schema` structured-output enforcement yet — Phase 3 will evaluate it.
- Multilingual quality for Hindi/Kannada unverified.
- `qwen/qwen3.8-27b` is a billable preview model that may be discontinued.
- Provider/rate-limit codes are now reachable in the adapter but not yet emitted by the route.

## 8. Next phase
**Phase 3 (M3/M4): first AI vertical slice** — call `provider.complete()` from the process route, enforce structured output, wire the side panel to the backend, and ship Simplify end-to-end.