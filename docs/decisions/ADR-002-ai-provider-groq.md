# ADR-002: AI Provider — Groq Cloud with Qwen 3.8 27B

Status: **Accepted**
Date: 2026-11-19
Supersedes: the Phase 0 placeholder (`AI_PROVIDER=openai`, `AI_MODEL=gpt-4o-mini`), which was never implemented.

## Context
StudyLens needs a text-transformation model for Simplify, Explain, Translate, and Steps. The Phase 0 architecture fixed a **provider-independent adapter**, so the provider choice must not leak into the API contract or the extension.

Requirements: low latency for an interactive side panel, low cost for a student project, multilingual support (English/Hindi/Kannada), structured JSON output, and no vendor lock-in.

## Decision
Use **Groq Cloud** via its OpenAI-compatible API, with **`qwen/qwen3.8-27b`** as the initial model.

| Setting | Value |
| --- | --- |
| Provider | Groq Cloud |
| Model family | Alibaba Qwen |
| Model ID | `qwen/qwen3.8-27b` |
| Base URL | `https://api.groq.com/openai/v1` |
| Endpoint | `POST /chat/completions` |
| Auth | `Authorization: Bearer $GROQ_API_KEY` (backend only) |
| Output mode | `response_format: { type: "json_object" }` |
| Temperature | 0.3 |
| Max completion tokens | 2048 |

### Verified model facts (from Groq's published model listing)
- Listed under **Preview Models**, not Production.
- Pricing: **$0.80 per 1M input tokens, $4.00 per 1M output tokens**. It is **not free**.
- Speed ≈ 450 tokens/sec.
- Context window 131,072 tokens; max completion 16,384 tokens.
- Developer-plan rate limits: 250K TPM, 1K RPM.
- Supports `reasoning_effort` values `none`/`low`/`medium`/`high`; default is `none`.

Groq states preview models are "intended for evaluation purposes only and should not be used in production environments as they may be discontinued at short notice."

## Consequences

### Positive
- Sub-second typical latency suits an interactive side panel.
- OpenAI-compatible surface keeps the adapter small (no SDK dependency; Node's global `fetch` suffices).
- JSON mode gives parseable output we can validate against the shared `ProcessResult`.
- Qwen handles Hindi and Kannada reasonably for the MVP scope.

### Negative / risks
- **Preview status**: the model may be withdrawn with little notice.
- **Billable**: every real call costs money. Mitigated by the `mock` provider — the entire automated suite runs offline at zero cost.
- **Rate limits** on the developer plan require graceful 429 handling.
- Multilingual quality is unverified for classroom-grade content; Phase 3 must evaluate it.

## Mitigations built in Phase 2
1. `GROQ_MODEL` and `GROQ_BASE_URL` are environment-configurable — switching models requires no code change.
2. `AiProvider` interface returns the shared `ProcessResult`; no Groq shape escapes the adapter.
3. `MockProvider` implements the same interface for tests and offline development.
4. Failure mapping to the existing contract codes: 401/403 → `INTERNAL_ERROR`, 429 → `RATE_LIMITED`, 5xx/network/malformed → `PROVIDER_ERROR`, abort → `PROVIDER_TIMEOUT`.
5. Bounded retries (`AI_MAX_RETRIES`, default 1) on retryable failures only; auth and malformed-output failures never retry.
6. Configurable timeout (`AI_TIMEOUT_MS`, default 30000) enforced with `AbortController`.

## How to change the model later
Edit the repository-root `.env`:
```text
GROQ_MODEL=<new-model-id>
```
Restart the backend. No source change, no rebuild of the extension. To switch providers entirely, add a class implementing `AiProvider` and register it in `provider.factory.ts`.

To list currently available models:
```bash
curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
```

## Alternatives considered
| Option | Why not chosen |
| --- | --- |
| OpenAI GPT-4o-mini | Higher latency and cost for this workload; Phase 0 placeholder only |
| Self-hosted open weights | GPU cost and ops burden disproportionate to a student MVP |
| Multiple providers at once | Premature; the interface already permits adding one later |

## Scope boundary
Phase 2 establishes and tests the adapter. `POST /api/v1/process` **still returns the `INTERNAL_ERROR` placeholder**. The user-facing Simplify feature and full result handling belong to Phase 3.