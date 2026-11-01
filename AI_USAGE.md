# AI Usage Declaration — TESSRA

This declaration is provided for the official problem statement §6.

## 1. Runtime AI inside the product

### Faculty schedule assistant

The faculty page at `/faculty/assistant` has two layers:

1. **Optional LLM interpretation** (`src/lib/llm.ts`) converts a natural-language request into a tightly validated JSON intent: request type (including placement explanations), course code, source/target day, periods, room kind and minimum capacity.
2. **Deterministic scheduling code** (`src/lib/assistant.ts`, `src/lib/scheduler.ts`, `src/lib/engine.ts`) reads live database state, searches alternatives, explains verified placement facts and validates every proposed placement.

Supported optional providers:

| Provider/API | Configuration | Purpose |
|---|---|---|
| OpenAI Chat Completions API or an OpenAI-compatible endpoint | `AI_PROVIDER=openai` or `openai-compatible`, `AI_API_KEY`, `AI_MODEL`, optional `AI_BASE_URL` | JSON intent extraction only |
| Anthropic Messages API | `AI_PROVIDER=anthropic`, `AI_API_KEY`, `AI_MODEL` | JSON intent extraction only |

No key is committed. When these variables are absent, malformed, timed out or out of credit, the built-in deterministic English/Hinglish parser handles the request. The assistant and all manual workflows remain operational.

The runtime system prompt and schema are committed in:

- `src/lib/llm.ts` (`FACULTY_ASSISTANT_SYSTEM_PROMPT`)
- `docs/prompts/faculty-assistant.md` (reviewable explanation and schema)

### Plain-language venue intake

The English/Hinglish venue-request parser (`src/lib/booking-parser.ts`) is deterministic and does not call an external model. It understands numeric and common Romanised-Hindi number words, flexible/vague windows, explicit constraints, recurring wording, equipment negation and ordered venue fallbacks. It extracts an editable draft, makes assumptions visible, asks for missing essentials, calls out conditions, rejects priority impersonation/bypass wording, enforces role ceilings, and proposes a compatible conflict-free venue. Submission still runs the ordinary server-side booking validator.

## 2. What an LLM is not allowed to decide

An LLM cannot decide or apply:

- timetable, exam, room or booking validity;
- room/faculty/group clashes, capacity, accessibility, breaks, fixed slots or availability;
- event category ceilings, priority order, permissions, approval or cancellation;
- any database write.

LLM output is treated as untrusted input. Invalid JSON and out-of-range fields are discarded. A schedule target is checked by deterministic code before it is shown, checked again when submitted, and requires coordinator approval before the published timetable changes.

The official CIT pipeline does not use an LLM: dataset → OR-Tools CP-SAT → deterministic checker → official validator → administrator approval/export.

## 3. AI used while building

An AI coding agent was used during the hackathon to help draft and review the Next.js UI, database schema, CP-SAT engine, tests and documentation. The orchestration environment did not expose a stable underlying model identifier, so none is asserted here. Generated work was reviewed and executed with TypeScript checks, production builds, Python tests and the unmodified official validator.

No image-generation, no-code UI generation, or copied project/template code was used.

## 4. Failure boundary

```text
Natural-language request
        ↓
optional LLM JSON interpretation (or deterministic fallback)
        ↓
strict schema/range sanitisation
        ↓
deterministic search + hard-constraint validation
        ↓
human confirmation / authorized approval
        ↓
server-side revalidation + audited database change
```

The manual booking form never depends on an LLM and remains available if every AI provider is disabled.
