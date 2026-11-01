# TESSRA — Deployment Guide

## Current production

- Web application: `https://tessra-five.vercel.app`
- Database/authentication: hosted PostgreSQL + Supabase Auth
- Scheduling runtime: private Vercel Python Service (`engine/`) bound to the Next.js service as `ENGINE_URL`
- Deployment definition: root `vercel.json`

The production judge path has been executed successfully: Admin reset → `/admin/official` → **Generate schedule** → 189/189 sessions and 41/41 exams → byte-identical official validator → 0 hard violations → downloadable JSON.

## Vercel Services architecture

`vercel.json` deploys two services together:

1. `web` — the public Next.js application.
2. `engine` — a private FastAPI service with pinned OR-Tools dependencies.

A service binding injects the private engine URL into the web service as `ENGINE_URL`; it does not need to be exposed publicly. `runOfficialPipeline` calls `/solve-validated`, which returns both the generated schedule and the official-validator report.

The deployed copy at `engine/official_validator.py` is byte-identical to the untouched organiser file at `official/starterpack/CrunchWeek_StarterPack/validator.py`. A regression test enforces that equality. The service health response also publishes the validator SHA-256 fingerprint.

## Production deployment

1. Import the public GitHub repository into Vercel with the repository root as the project root.
2. Use the **Services** framework preset. Vercel reads the two service definitions from `vercel.json`.
3. Configure the database and authentication variables from `.env.example`:
   - `DATABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Optional runtime variables:
   - `ENGINE_TOKEN` if the engine is deployed on a public alternate host. A private Vercel service binding does not require it.
   - `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` for optional LLM intent extraction.
5. Deploy from `main`. GitHub integration automatically promotes successful production builds.

The official page allows up to 240 seconds for CP-SAT cold start, solving and validation. The current official baseline normally completes inside that limit.

## Local development

Prerequisites: Node.js 22+, Python 3.12+ and PostgreSQL.

```bash
npm ci
python3 -m pip install -r engine/requirements.txt pytest
cp .env.example .env
npm run dev
```

Without `ENGINE_URL`, the Next.js application uses the local Python subprocess fallback. You can also run the engine directly:

```bash
cd engine
uvicorn app:app --host 0.0.0.0 --port 8000
```

Then set `ENGINE_URL=http://localhost:8000` in the web environment.

## Database initialization

1. Set `DATABASE_URL` to a PostgreSQL database.
2. Apply the Drizzle schema with `npx drizzle-kit push`.
3. The first application boot seeds the compact role-workspace demo.
4. The official CIT dataset remains the untouched JSON under `official/` and is loaded by the official pipeline.

## Post-deployment verification

1. `GET /api/health` returns `{"ok":true}`.
2. Sign in with every README demo account.
3. As Admin, use **Reset demo data** and confirm 60/60 demo sessions regenerate.
4. Open `/admin/official` and select **Generate schedule**.
5. Confirm 189 timetable sessions, 41 exams and 0 hard violations.
6. Download both the schedule and report.
7. Independently run:

```bash
python official/starterpack/CrunchWeek_StarterPack/validator.py \
  --data official/starterpack/CrunchWeek_StarterPack/data/cit_public.json \
  --schedule downloaded-schedule.json
```

## Submission checklist

- [x] Public GitHub repository
- [x] Live deployment
- [x] Four working demo accounts in README
- [x] Admin reset control
- [x] App-produced `exports/schedule.json` and `exports/schedule_after.json`
- [x] `AI_USAGE.md`, `THIRD_PARTY.md` and `.env.example`
- [ ] Final walkthrough video link supplied by the submission owner
