# StudyLens — Privacy and Security Requirements

This document states the policy **and** what has actually been verified in code today. Policy statements are requirements for all future phases; they are not claims that future behaviour is already tested.

## 1. Verification Boundary (End of Phase 3)

Verified by code inspection + manual testing:
-   **AI Processing Active**: `/api/v1/process` calls Groq Qwen 3.8 27B via provider adapter.
-   **No Key Leakage**: API key in backend `.env` only. Extension has zero credential access.
-   **Plain Text Output**: HTML/code fences/control chars stripped. Max 12k char cap.
-   **No Persistence**: Selected/simplified text in React state only. Lost on close.
-   **Safe Errors**: Provider errors mapped to fixed messages. No raw provider text exposed.
-   **Bound Fetch**: `globalThis.fetch.bind(globalThis)` prevents context loss.
-   **Host Permissions Explicit**: localhost/127.0.0.1/*.app.github.dev declared in manifest.

Not Yet Verified:
-   Production HTTPS deployment
-   User authentication/authorization
-   Rate limiting beyond provider level
-   Audit logging of AI requests

## 2b. Provider credential policy (implemented)
- Keys live only in backend environment variables, loaded from the git-ignored root `.env`.
- `.env.example` must contain `GROQ_API_KEY=` with no value. It is a tracked file.
- Startup fails fast with a clear message if `AI_PROVIDER=groq` and no key is present.
- `AI_PROVIDER=mock` requires no credentials and is the default for development and CI.
- Test fixtures use obviously fake values (`gsk_test_key`, `gsk_super_secret`, `gsk_leftover`).

## 2c. Incident record — committed API key (Phase 2)
A real Groq key was briefly placed in `.env.example` and committed locally. GitHub push protection rejected the push, so the secret never reached the remote. The key was rotated, the template blanked, and the local commit amended before a successful push. Full details in `docs/phase-2-completion-report.md` §4.

Rule going forward: **never write a real credential into any tracked file, including templates.** Do not use GitHub's "allow this secret" unblock link for a live key.

## 3. Data storage policy (requirement)
- **No raw page text or selected text is stored by default.** This includes server logs, databases, and browser storage.
- If logging is enabled, permitted fields are: action, timestamp, status, latency, error code, request ID.
- Request history is P2 and off by default (`ENABLE_REQUEST_HISTORY=false`). If ever enabled, it stores metadata only — never source text or generated text.
- Any future database must use migrations and parameterised queries, and its files must stay out of Git.

## 4. Secret management (requirement)
- AI provider keys live only in backend environment variables.
- No secrets in extension source, extension bundle, browser storage, or Git history.
- `.env.example` carries placeholder names only.
- Before each release, scan the extension bundle and Git history for key material.

## 5. Origin and host access (partially implemented)
- Implemented: CORS allows `chrome-extension://` origins, requests with no `Origin` header, and origins explicitly listed in `ALLOWED_ORIGINS`. Methods limited to `GET`, `POST`.
- Required in Phase 1: minimise `host_permissions`; prefer `activeTab` and dynamic permission grants over broad `<all_urls>`.
- Every extension permission must be justified in the README when added.

## 6. Untrusted input policy (requirement)
- All webpage text is untrusted data, never instructions.
- Prompts must isolate source text and ignore embedded instructions that try to override system/developer rules.
- Validate all external input (implemented in `validateProcessRequest`) and all AI output (Phase 2).
- **Never execute AI-generated HTML, JavaScript, or scripts.** Render results as text in the side panel; no `innerHTML` of model output, no `eval`.
- Never silently modify the original webpage; the reading view must be reversible.

## 7. Review checklist

| Item | Status |
| --- | --- |
| Data transmission policy documented | Done |
| Data storage policy documented | Done |
| No raw-text persistence implementation present | Verified (nothing exists) |
| No request-body logging in server code | Verified |
| API key handling documented; `.env` ignored | Verified |
| Input validation implemented | Verified (shared validator + tests) |
| CORS restricted | Implemented for backend |
| Extension permission minimisation | Pending Phase 1 |
| AI output validation / prompt-injection handling | Pending Phase 2 |
| Full security test pass | Pending Phase 6 |