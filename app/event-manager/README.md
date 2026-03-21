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

### Required env vars (`app/event-manager/.env.local`)

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...   # accepts publishable key (sb_publishable_...) or legacy anon key
```

## Data contracts (Supabase)

- Types are defined in `src/types/contracts.ts`, derived from the repo root `supabase/database.types.ts`.
- Exports: `TrackedEventRow`, `EventsInsert`, `TEEventPreviewRow`, `EventInsertFromTe` (matches `scripts/populateEventsByPerformer.js`), and `parseTeEventId()` for numeric IDs.
- After you regenerate database types (`npm run gen:types` from the repo root), run:

```bash
npm run typecheck
```

## Deployment (Vercel)

- **Root Directory**: `app/event-manager`
- **Security**: enable **Vercel Password Protection** for **Production + Preview** deployments

## Notes

- TE requests are proxied server-side through Supabase Edge Function `te-events-proxy`.
- Do not ship TE secrets to the browser. Keep `TE_API_TOKEN` / `TE_API_SECRET` only in Supabase function secrets.

## Auth

- App auth supports two options:
  - Magic Link (`supabase.auth.signInWithOtp`)
  - Email + Password (`supabase.auth.signInWithPassword`)
- Auth flow:
  - `src/app/AuthGate.jsx` loads session (`getSession`) and subscribes to `onAuthStateChange`.
  - `src/app/LoginPage.jsx` provides both login modes.
  - `src/app/EventManagerPage.jsx` signs out via `supabase.auth.signOut()`.
- Password login requires that users already have a password set in Supabase Auth users.

## Edge Function auth (publishable-key compatible)

This project uses Supabase **publishable API keys** (`sb_publishable_...`), not legacy JWT-based
anon keys. The Edge Functions gateway `verify_jwt` is incompatible with publishable keys, so
authenticated functions use manual verification instead:

- **Gateway**: `verify_jwt = false` in `config.toml`; deploy with `--no-verify-jwt`.
- **In-function auth**: `requireAuth()` from `supabase/functions/_shared/auth.ts` validates the
  bearer token against `GET /auth/v1/user` (works with both publishable and legacy keys).
- **Frontend**: `getEdgeFunctionAuthHeaders()` in `src/lib/supabaseClient.js` explicitly passes
  `Authorization: Bearer <jwt>` to `functions.invoke()`.

### Deploying authenticated functions

```bash
supabase functions deploy te-events-proxy --project-ref <ref> --no-verify-jwt
```

### Adding auth to a new Edge Function

```typescript
import { requireAuth } from "@shared/auth.ts";

Deno.serve(async (req) => {
  const auth = await requireAuth(req, corsHeaders);
  if (!auth.authorized) return auth.response;
  // auth.userId is available
});
```

### Supabase secrets used by Edge Functions

| Secret | Source | Purpose |
|---|---|---|
| `SUPABASE_URL` | auto-injected | Auth verification base URL |
| `SUPABASE_ANON_KEY` | auto-injected | `apikey` header for auth verification |
| `SUPABASE_PUBLISHABLE_KEY` | manual (optional) | Preferred over `SUPABASE_ANON_KEY` if set |
| `TE_API_TOKEN` | manual | TE API authentication |
| `TE_API_SECRET` | manual | TE API HMAC signing |
| `TE_API_BASE_URL` | manual | TE API base URL override |

## Automated checks

- Prevent TE secrets in frontend source:

```bash
npm run check:no-te-secrets
```
