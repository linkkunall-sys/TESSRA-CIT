# TESSRA CIT access guide

## Demo accounts

Password for all four accounts: `tessra123`

| Role | Email | Landing page |
|---|---|---|
| Administrator — Spectra Core Team | `spectra.core.team@cit.ac.in` | `/admin` |
| Department coordinator — ECE Department | `ece.department@cit.ac.in` | `/coordinator` |
| Faculty — Dr. Ananya Mishra (F01) | `f01@cit.ac.in` | `/faculty` |
| Club representative — Coding Club | `coding.club@cit.ac.in` | `/club` |

These email addresses are deterministic login adapters derived from starter-pack identities. The source pack does not provide email addresses.

## Hosted authentication

When Supabase variables are configured, first-run seeding creates and email-confirms the four demo Auth users through the service-role API, then links their UUIDs to operational profiles. All other CIT faculty remain operational profiles and can receive accounts through the existing administrator/access-request workflows.

If hosted Auth is not configured, the local password hashes and session implementation support the same credentials.

## Separate infrastructure

TESSRA CIT must use a database and deployment separate from the completed original TESSRA submission. Apply `supabase_schema_migration.sql` to an empty database, configure environment variables, and allow first-request seeding to import the CIT baseline.

## Security

- Never commit `.env.local`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, database passwords, deploy keys, or unrestricted deployment tokens.
- Replace the demo password before using the application outside a review/demo environment.
