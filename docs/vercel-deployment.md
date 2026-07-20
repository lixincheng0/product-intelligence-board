# Vercel Deployment

This app is a plain Node.js server with static frontend assets. Vercel runs it through `api/index.js`, which exports the server handler from `server.js`.

## Pre-Deployment Checks

Run:

```bash
npm run check
```

Confirm:

- No broken imports.
- No syntax errors.
- `.env`, `.env.local`, `.env.production`, `backups/`, `*.dump`, and `*.sql` are ignored.
- No real secrets are committed.
- Supabase `app_state` table exists.
- `data/store.json` has been uploaded to Supabase using `npm run upload:db`.
- Vercel environment variables are configured.

## Required Environment Variables

Set these in Vercel Project Settings > Environment Variables:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STATE_ID=production
SESSION_SECRET=replace-with-a-long-random-string
```

For a production-data mirror that must never write to the shared state, also set:

```env
MIRROR_READ_ONLY=true
```

This server-side guard blocks every data-changing API route while keeping login,
logout, PM profile selection, dashboards, filters, archives, and timelines readable.

Optional backend passcode overrides:

```env
PIB_PASSCODE_VIEWER=
PIB_PASSCODE_PM_TEAM=
PIB_PASSCODE_PRODUCT_LEAD=
PIB_PASSCODE_ADMIN=
PIB_PASSCODE_PMM=
```

Optional manual database backup variable, used locally rather than by Vercel:

```env
DATABASE_URL=
```

Current code does not require:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=
```

Future-only variables:

```env
OPENAI_API_KEY=
AI_REPORT_MODEL=
LARK_APP_ID=
LARK_APP_SECRET=
LARK_TARGET_CHAT_ID=
CRON_SECRET=
```

## Environment Variable Rules

- Only variables prefixed with `NEXT_PUBLIC_` should be exposed to browser code.
- `SUPABASE_SERVICE_ROLE_KEY` must remain backend-only.
- Passcodes must remain backend-only.
- Do not commit `.env.local`.
- Do not paste service role keys into screenshots or chat.

## Upload Current Data To Supabase

After creating the `app_state` table, upload current local data:

```bash
SUPABASE_URL="https://your-project-ref.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
npm run upload:db
```

Expected result:

```text
Uploaded data/store.json to Supabase app_state.production
```

## Vercel Deployment Steps

1. Push latest code to GitHub.
2. Create or select the Vercel project.
3. Import the GitHub repository.
4. Framework preset: `Other`.
5. Build command: leave empty, or use `npm run check` only if you want syntax checks during deployment.
6. Output directory: leave empty.
7. Add required environment variables.
8. Trigger deployment.
9. Check deployment logs.
10. Open the production URL.
11. Run the smoke test checklist in `docs/production-smoke-test.md`.

## Production URL

The current app does not need `NEXT_PUBLIC_APP_URL`. If report links or external callbacks are added later, set it to the Vercel production URL.

## Branch Strategy

Recommended:

- `main` = production
- feature branches = Vercel preview deployments
- Test in preview before promoting to production
- Vercel Production should use `SUPABASE_STATE_ID=production`.
- Vercel Preview should use `SUPABASE_STATE_ID=staging`.

Minimal safe approach for this launch:

- Commit deployment changes.
- Push to GitHub.
- Deploy a Vercel preview.
- Run smoke test.
- Promote the same commit to production.

## Known Production Caveat

The current production database is a single JSONB row in `app_state`. This is acceptable for first production launch and shared persistence, but it does not provide normalized database constraints or table-level foreign keys. Use manual backups before large admin edits or imports.
