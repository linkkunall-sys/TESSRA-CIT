# TESSRA CIT delivery plan

## Completed application work

1. Preserve the original TESSRA submission and create a separate CIT repository.
2. Import the full TESSRA feature set.
3. Preserve the supplied CrunchWeek archive, extracted official data, validator, engine, and clean exports.
4. Replace the legacy demonstration seed and identities with the CIT operational import.
5. Extend the relational model for source IDs, source metadata, room/faculty constraints, elective baskets, expected attendance, and multi-room examinations.
6. Adapt the generator, validators, queries, actions, forms, exports, reset behavior, tests, and documentation.
7. Verify type safety, lint, tests, production build, and official organiser validation.
8. Commit and push the complete application under the user's GitHub identity.

## Infrastructure phase (after application delivery)

1. Create/connect a separate PostgreSQL/Supabase project.
2. Apply `supabase_schema_migration.sql`.
3. Configure the separate Vercel project and environment variables.
4. Configure the Python engine service or `ENGINE_URL`.
5. Verify all four demo roles and production routes.

The original TESSRA repository, database, and deployment are never repurposed for this edition.
