# RestroPilot AI

RestroPilot AI is a tenant-scoped restaurant operations workspace built with Next.js, Clerk organizations, PostgreSQL, and Prisma. The client-facing prototype includes conventional restaurant management, analytics, historical imports, and a controlled AI Manager.

## Local development

1. Copy `.env.example` to `.env` and supply development credentials.
2. Install dependencies with `npm install`.
3. Validate and generate the database client with `npx prisma validate` and `npx prisma generate`.
4. Confirm the established development database with `npx prisma migrate status`. See the production migration note before initializing any empty database.
5. Start the application with `npm run dev`.

## Required production environment

- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`
- `AI_PROVIDER`
- `GEMINI_API_KEY` and `GEMINI_MODEL` when Gemini is enabled
- `AI_FALLBACK_PROVIDER`, `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL` when OpenRouter fallback is enabled

Only Clerk publishable configuration uses the `NEXT_PUBLIC_` prefix. Database and AI provider credentials must remain server-side.

## Verification

```bash
npx prisma validate
npx prisma migrate status
npx prisma generate
npx tsc --noEmit
npm run lint
npm test
npm run build
```

## Production migration note

The historical migration directory contains two migrations for `Order.inventoryConsumedAt`. The current development database is healthy because `20260821090000_add_order_inventory_consumed_at` was recorded as applied with zero steps and `20260821092352_add_order_inventory_consumed_at` performed the change. Applied migration files have intentionally not been rewritten.

For a brand-new empty production database, reproduce that recorded history before deployment:

```bash
npx prisma migrate resolve --applied 20260821090000_add_order_inventory_consumed_at
npx prisma migrate deploy
```

For an existing database whose migration status is already current, run only `npx prisma migrate deploy`. Always take a database backup or Neon branch before production migration work.

## Vercel deployment checklist

1. Create or select the production Neon database and configure a secure pooled PostgreSQL connection.
2. Add all required environment variables to Vercel Production; do not copy development Clerk keys.
3. Configure a Clerk production instance, production domains, sign-in/sign-up URLs, and organization support.
4. Apply the production migration procedure above from a controlled environment.
5. Keep the build command as `npm run build`; `postinstall` already runs `prisma generate`.
6. Deploy, then smoke-test sign-in, organization switching, onboarding, every sidebar route, one safe conventional write, and an AI read request.
7. Verify tenant isolation with two Clerk organizations before inviting client users.
