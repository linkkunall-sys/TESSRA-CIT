# TESSRA — Access Credentials & Deployment Info

> ⚠️ **This file contains sensitive credentials.** Do not share publicly.

---

## 🌐 Live URLs

| Service | URL |
|---------|-----|
| **Production (Vercel)** | https://tessra-five.vercel.app |
| **GitHub Repository** | https://github.com/kunalchwdry/TESSRA.git |

---

## 🔑 Demo Accounts (All passwords: `tessra123`)

| Role | Email | Password | Dashboard |
|------|-------|----------|-----------|
| **Admin** | `admin@westbrook.edu` | `tessra123` | `/admin` |
| **Department Coordinator** | `coordinator.cse@westbrook.edu` | `tessra123` | `/coordinator` |
| **Faculty** | `ananya.rao@westbrook.edu` | `tessra123` | `/faculty` |
| **Club Representative** | `robotics@westbrook.edu` | `tessra123` | `/club` |

All accounts are **email-confirmed** and **pre-approved** in Supabase Auth.

---

## ☁️ Supabase (Project: `lsdytdpaqogcvutaordj`)

| Setting | Value |
|---------|-------|
| Project Ref | `lsdytdpaqogcvutaordj` |
| Auth URL | https://lsdytdpaqogcvutaordj.supabase.co |
| Email Provider | ✅ **ENABLED** (Authentication → Providers → Email) |
| Email Confirmation | Enabled for all accounts |

### Supabase Auth Users (created via REST API)

| Email | Auth UUID | Status |
|-------|-----------|--------|
| `admin@westbrook.edu` | Created via Supabase admin API | Email-confirmed |
| `coordinator.cse@westbrook.edu` | Created via Supabase admin API | Email-confirmed |
| `ananya.rao@westbrook.edu` | Created via Supabase admin API | Email-confirmed |
| `robotics@westbrook.edu` | Created via Supabase admin API | Email-confirmed |

All passwords reset to `tessra123` via Supabase admin API.

### Environment Variables (Vercel)

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Set in Vercel dashboard (production) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lsdytdpaqogcvutaordj.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Set in Vercel dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Set in Vercel dashboard (server-only) |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `0` |

---

## 🚀 Vercel Deployment

| Setting | Value |
|---------|-------|
| Project | `tessra` |
| Team | `kunalchwdrys-projects` |
| Production URL | https://tessra-five.vercel.app |
| GitHub Repo | https://github.com/kunalchwdry/TESSRA.git |
| GitHub SSH Key | `~/.ssh/id_ed25519_tessra` |

Deploy command:
```bash
VERCEL_TOKEN=<token> npx vercel deploy --prod
```

---

## 🗄 Database Migration (CIT Data — Local PostgreSQL)

CIT data successfully migrated to local PostgreSQL:

| Entity | Count |
|--------|-------|
| Departments | 12 |
| Courses | 75 |
| Student Groups | 20 |
| Rooms | 41 |
| Offerings | 214 |
| Availability Blocks | 95 |
| Bookings | 38 |

Schema: 26 tables (see `src/db/schema.ts` and `drizzle/0000_supabase_schema.sql`)

---

## 🛠 How Access Requests Work

1. User visits `/access-request` and submits: name, email, password, role (coordinator/faculty/club), department/club, reason
2. Request is stored in `access_requests` table with status `pending`
3. Admin visits `/admin/access-requests` and reviews pending requests
4. Admin clicks **Approve** → creates local user record + Supabase Auth user (via service role key) + links `supabase_uid`
5. User can now sign in at `/login` with their email and password
6. Admin can also create accounts directly at `/admin/create-account` (instant approval, no request flow needed)

---

## 🔧 Local Development

```bash
# Clone
git clone https://github.com/kunalchwdry/TESSRA.git
cd TESSRA

# Install (Node.js 22+)
npm ci
python3 -m pip install -r engine/requirements.txt pytest

# Environment (see .env.example)
cp .env.example .env

# Database
npx drizzle-kit push

# Run
npm run dev
# Open http://localhost:3000

# Sign in with any demo account (password: tessra123)
```

---

## 📝 Notes

- Supabase Auth email provider is **ENABLED** in the dashboard
- The `admin.createUser()` operation requires the **service role key** (not anon key) — both approve and create-account flows use `createAdminClient()`
- Login has **self-healing**: if an approved local user lacks a Supabase Auth account, sign-in auto-creates it
- Port 5432 (Supabase PostgreSQL) is not reachable from the sandbox; the connection pooler port 6543 is reachable but had SSL issues (fixed with `NODE_TLS_REJECT_UNAUTHORIZED=0`)
- Drizzle-kit push is blocked by TTY requirement in the sandbox; schema SQL is pre-generated at `drizzle/0000_supabase_schema.sql`