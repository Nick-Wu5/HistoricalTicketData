# Event Manager (internal)

Internal admin interface for:

- browsing/searching local Supabase `events`
- querying TicketEvolution (TE), previewing results, and inserting only non-duplicates by `te_event_id`

This app is intentionally small-scope; V1 requirements live in `docs/TODO.md` at the repo root.

## Local development

```bash
cd app/event-manager
npm install
npm run dev
```

## Deployment (Vercel)

- **Root Directory**: `app/event-manager`
- **Security**: enable **Vercel Password Protection** for **Production + Preview** deployments

## Notes

- TE requests must be proxied server-side (recommended: Supabase Edge Function). Do not ship TE secrets to the browser.
