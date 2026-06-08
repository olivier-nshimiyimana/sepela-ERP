# Sepela ERP

Desktop POS and store management built with **Tauri 2**, **React**, and **Tailwind CSS**. Offline-first with optional **SEPELA cloud sync**.

## Roles (offline demo accounts)

| Role | Username | Default password | Access |
|------|----------|------------------|--------|
| **Owner (boss)** | `boss` | `boss123` | Reports, users, settings, invoices & refunds |
| **Manager** | `manager` | `manager123` | POS, products, stock, settings, invoices & refunds |
| **Cashier** | `cashier` | `cashier123` | POS, view/reprint invoices (no refunds) |

Change demo passwords before production use. The owner can add more accounts from the user icon in the header.

### Cloud operator login (portal-linked desktop)

When **Settings → Cloud sync** has API URL, bearer token, and merchant code set, sign-in uses **portal operator** accounts (not the offline demo users).

1. Start **portal-api** (`cd portal-api && npm run dev`) — `http://127.0.0.1:4000`.
2. In **portal-admin**, create the merchant, branch, device, and activation code; add operators under **Accounts**.
3. On the desktop: **Settings → Cloud sync** — bearer token matches `PORTAL_BEARER_TOKEN`, correct **merchant code**, then activate with the portal code.
4. Sign out and sign in with the operator username and password.

`ERR_CONNECTION_REFUSED` means portal-api is not running. `401` usually means wrong credentials or **merchant code mismatch**.

## Run (development)

```bash
npm install
npm run tauri dev
```

## Deployment (Windows installer)

Production builds with **EULA / license** in the installer and on first launch: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

```bash
# Set VITE_PORTAL_API_TOKEN in .env (matches portal-api PORTAL_BEARER_TOKEN)
npm run build:installer
```

Portal API redeploy checklist: **[docs/PORTAL_REDEPLOY.md](docs/PORTAL_REDEPLOY.md)**.

## Product catalog (FEFO batches)

Each product row is a **batch** with:

- **Product name**, **lot number**, **expiration date**
- **Price (USD)** — manager sets retail price
- **Stock** (item-level via inventory breakdown)

**Expiry:** expired batches cannot be sold; managers see alerts within the configured window (Settings).

## Promotions

- Scopes: all products, category, or specific product
- Optional client tier, min order, date window
- Auto-apply at POS checkout; shown on invoice and reports
- Manage under **Settings → Promotions**

## POS keyboard shortcuts

| Key | Action |
|-----|--------|
| **F3** or **/** | Focus product search |
| **Enter** (search) | Add first match, or open payment if cart has items |
| **F4** or **Enter** (POS) | Open payment |
| **1 / 2 / 3** | Cash / Mobile money / Card |
| **Enter** | Validate sale |
| **P** | Finish and open invoice for print |
| **Esc** | Close payment |

## Invoices & refunds

- After payment: **Print invoice** or **Done**
- Company logo and details: **Settings → Invoice & company**
- Formats: A4, Letter, Thermal 80mm — print, PDF, copy
- **Invoices** (document icon): history, reprint, refund (manager & owner)
- Refunds mark the sale refunded; stock restore optional; cash return is manual

## Data storage

| Layer | Location / technology |
|-------|------------------------|
| **Desktop DB** | `D:\SepelaERP\data\sepela.db` (fallback `C:\SepelaERP\data\sepela.db`) |
| **Engine** | SQLite via `@tauri-apps/plugin-sql` — schema v9 |
| **Dev browser** | `localStorage` when not running in Tauri |
| **Cloud** | PostgreSQL on portal-api — see [docs/SYNC.md](docs/SYNC.md) |

Manual **Cloud sync** under **Settings** pushes products, sales, promotions, categories, and more.

### Receipt types (SDC-ready)

- **NORMAL** — fiscal sales / refunds  
- **COPY** — reprints from invoice history  
- **TRAINING** — practice mode (Settings)  
- **PROFORMA** — quote before payment  
