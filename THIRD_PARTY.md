# Third-Party Software and Services

TESSRA uses the following third-party software. Versions are pinned by `package-lock.json` and constrained by `engine/requirements.txt`.

## Web application

| Package | Use | License |
|---|---|---|
| [Next.js](https://nextjs.org/) | App Router, server rendering, route handlers and server actions | MIT |
| [React / React DOM](https://react.dev/) | User interface | MIT |
| [TypeScript](https://www.typescriptlang.org/) | Static typing and build-time checks | Apache-2.0 |
| [Tailwind CSS](https://tailwindcss.com/) and `@tailwindcss/postcss` | Styling and PostCSS integration | MIT |
| [Inter Variable Font](https://fontsource.org/fonts/inter) via `@fontsource-variable/inter` | Self-hosted interface font | SIL Open Font License 1.1 |
| [Lucide React](https://lucide.dev/) | Interface icons | ISC |
| [Drizzle ORM / Drizzle Kit](https://orm.drizzle.team/) | PostgreSQL queries, schema and migration tooling | Apache-2.0 |
| [`pg` / node-postgres](https://node-postgres.com/) | PostgreSQL driver and connection pool | MIT |
| [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) and [`@supabase/ssr`](https://github.com/supabase/ssr) | Authentication clients and server-rendered session support | MIT |
| [`dotenv`](https://github.com/motdotla/dotenv) | Local command-line environment loading | BSD-2-Clause |
| [ESLint](https://eslint.org/) and `eslint-config-next` | Static code-quality checks | MIT |
| [tsx](https://tsx.is/) | Execute TypeScript booking-parser tests with Node's test runner | MIT |

## Scheduling service

| Package | Use | License |
|---|---|---|
| [Google OR-Tools CP-SAT](https://developers.google.com/optimization) | Constraint model for timetable generation and minimal-move repair | Apache-2.0 |
| [FastAPI](https://fastapi.tiangolo.com/) | HTTP boundary for the deployed Python scheduling/validation service | MIT |
| [Uvicorn](https://www.uvicorn.org/) | Local/container ASGI server for the engine service | BSD-3-Clause |
| [Pydantic](https://docs.pydantic.dev/) | FastAPI request/response validation | MIT |
| [pytest](https://pytest.org/) | Python engine and official-validator regression tests | MIT |

## Infrastructure and hosted services

| Service | Use |
|---|---|
| [PostgreSQL](https://www.postgresql.org/) | Application database (PostgreSQL License) |
| [Supabase](https://supabase.com/) | Hosted PostgreSQL and email/password authentication |
| [Vercel](https://vercel.com/) | Production deployment |
| [GitHub](https://github.com/) | Source control and public repository hosting |
| OpenAI Chat Completions API or a compatible endpoint (optional) | Faculty-request JSON intent extraction when configured |
| Anthropic Messages API (optional) | Alternative faculty-request JSON intent extraction when configured |

The product does not require either LLM service. See [`AI_USAGE.md`](./AI_USAGE.md) for the validation boundary, prompt location and failure behaviour.

## Organiser-provided material

The unmodified Crunch Week starter pack under `official/starterpack/CrunchWeek_StarterPack/` contains:

- the public CIT JSON/CSV dataset;
- sample natural-language requests and disruption data;
- the official standard-library-only `validator.py`;
- the organiser README and example export.

The original organiser files remain untouched. Because the deployed engine is an isolated service, `engine/official_validator.py` is an exact byte-for-byte deployment copy of the supplied `validator.py`; a regression test enforces equality. It runs only after CP-SAT generation and never participates in finding or changing a schedule.
