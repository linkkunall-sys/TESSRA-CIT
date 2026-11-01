# Faculty assistant runtime prompt

The production prompt is exported as `FACULTY_ASSISTANT_SYSTEM_PROMPT` from `src/lib/llm.ts`. It is committed in code so the runtime and reviewed version cannot drift.

## Purpose

The optional LLM is an **untrusted natural-language interpretation layer**. It classifies a faculty request and extracts course/day/period/capacity preferences into a small JSON object. The `explain` intent identifies a published placement; deterministic code then reports verified hard-constraint facts and alternative availability.

It may suggest a requested destination, but it cannot:

- decide whether a room or slot is valid;
- approve or apply a timetable change;
- bypass role, conflict, availability, capacity, fixed-slot or break rules;
- write to the database;
- return arbitrary tool calls.

The deterministic scheduler searches and validates alternatives after parsing. A proposal is validated again when the faculty member submits it, and a coordinator must approve it before the published timetable changes.

## JSON schema

```json
{
  "intent": "schedule | free_room | workload | availability | reschedule | requests | conflicts | explain | unknown",
  "courseCode": "string or null",
  "sourceDay": "0..4 or null",
  "targetDay": "0..4 or null",
  "queryDay": "0..4 or null",
  "periods": "array of 1..9 or null",
  "minCapacity": "positive integer or null",
  "roomKind": "lab | teaching | null"
}
```

Day numbering is Monday `0` through Friday `4`. Any malformed, out-of-range or non-JSON response is discarded and the built-in deterministic parser handles the request instead.
