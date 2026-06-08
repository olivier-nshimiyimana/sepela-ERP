# Portal API — production redeploy verification

Use this after pushing desktop **v1.0.0** (promotions, categories, schema v9) to ensure Render matches the POS build.

## 1. Pre-deploy (local)

From repo root:

```bash
cd portal-api
npm install
npm run check
npm run build
```

Or from root:

```bash
node scripts/verify-portal-api.js
```

All steps must pass before redeploying on Render.

## 2. Deploy on Render

1. Push latest `main` (or your release branch) to GitHub.
2. Trigger **Manual Deploy** on the **sepela-erp-api** service (or wait for auto-deploy).
3. Confirm deploy logs show migrations without errors:
   - `migrateInventoryBreakdown`
   - `migrateOperatorUsernameGlobal`
   - `migratePromotions` → creates `sync_product_categories`, `sync_promotions`

## 3. Environment variables (Render)

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORTAL_BEARER_TOKEN` | Same value baked into desktop `VITE_PORTAL_API_TOKEN` |
| `CORS_ORIGINS` | Include `https://sepela-erp-portal-admin.onrender.com` |

## 4. Post-deploy smoke test

```bash
# Health
curl https://sepela-erp-api.onrender.com/health

# Expected: {"ok":true,"service":"sepela-portal-api"}
```

On a desktop install (production API URL + token):

1. **Settings → Cloud sync** — merchant code, activate device if needed.
2. Create a test promotion on the POS.
3. **Sync now** — should succeed; promotion row moves to `SYNCED`.
4. Owner **Reports** (online login) — sales appear after sync.

## 5. PostgreSQL tables (optional SQL check)

On the portal database:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('sync_promotions', 'sync_product_categories');
```

Both tables should exist after first boot post-deploy.

## 6. Desktop installer alignment

Release build must use:

- `.env.production` → `VITE_PORTAL_API_URL=https://sepela-erp-api.onrender.com`
- `.env` or CI → `VITE_PORTAL_API_TOKEN=<PORTAL_BEARER_TOKEN>`

Then:

```bash
npm run legal:sync
npm run build:installer
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Sync fails on promotions | Redeploy portal-api; confirm `sync_promotions` exists |
| CORS / cannot reach portal | Redeploy API; check `CORS_ORIGINS` and desktop uses production URL |
| 401 on sync | Token mismatch between desktop build and `PORTAL_BEARER_TOKEN` |
| Login works, sync empty | Operator merchant code must match desktop tenant |
