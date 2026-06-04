<<<<<<< HEAD
# Sepela ERP

Desktop POS and store management built with **Tauri 2**, **React**, and **Tailwind CSS**.

## Roles

| Role | Username | Default password | Access |
|------|----------|------------------|--------|
| **Owner (boss)** | `boss` | `boss123` | Reports, users, settings, invoices & refunds |
| **Manager** | `manager` | `manager123` | POS, products, stock, settings, invoices & refunds |
| **Cashier** | `cashier` | `cashier123` | POS, view/reprint invoices (no refunds) |

Change demo passwords before production use. The owner can add more accounts from the user icon in the header.

### Cloud operator login (portal-linked desktop)

When **Settings → Cloud sync** has API URL, bearer token, and merchant code set, sign-in uses the **portal operator** accounts (not the offline `boss` / `manager` / `cashier` demo users).

1. Start **portal-api** (`cd portal-api && npm run dev`) — `http://127.0.0.1:4000`.
2. In **portal-admin**, create the merchant, branch, device, and activation code; set **Accounts → Add operator** for that merchant (username + password, status **ACTIVE**).
3. On the desktop app (while still on offline demo login, or after resetting cloud fields): **Settings → Cloud sync** — same **bearer token** as `PORTAL_BEARER_TOKEN` in `portal-api/.env`, correct **merchant code** (e.g. `sepela-pharmacy`), then activate the device with the portal activation code.
4. Sign out and sign in with the **operator username and password** from step 2.

`ERR_CONNECTION_REFUSED` means portal-api is not running. `401 Invalid username or password` usually means wrong operator credentials or a **merchant code mismatch** between desktop settings and the operator’s merchant in the portal.

## Run

```bash
npm install
npm run tauri dev
```

## Deployment (Windows installer)

Production builds with **EULA / license** in the installer and on first launch: see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

```bash
npm run build:installer
```

## Product catalog (pharmacy standards)

Each product includes:

- **Product name**
- **Lot number** (batch traceability)
- **Expiration date** (required)
- **Price (USD)** — set by manager
- **Stock quantity**

**Expiry rules:**

- Products **past expiration cannot be sold** (disabled on register for cashiers).
- **Manager** sees an alert banner when items expire within the configured window (default **30 days**, adjustable in settings).
- **Restock** can update lot number and expiration for the new batch.

## POS keyboard shortcuts

| Key | Action |
|-----|--------|
| **F3** or **/** | Focus product search |
| **Enter** (search) | Add first matching product, or open payment if cart has items |
| **F4** or **Enter** (POS) | Open payment |
| **1 / 2 / 3** | Cash / Mobile money / Card (payment modal) |
| **Enter** | Validate sale · finish without print |
| **P** | Finish and open invoice for print |
| **Esc** | Close payment or finish sale |

## Invoices & refunds

- After payment, choose **Print invoice** or **Done** (Enter = done without print).
- **Copy** uses fixed-width plain text (42 columns) for receipts and messaging apps.
- **Customize** company name, DRC address lines, invoice title, footer text, and invoice number prefix under **Settings** (gear) — defaults are **Sepela Inc** and **Democratic Republic of the Congo**.
- Sequential invoice numbers (e.g. `SEP-00001`) are stored in localStorage.
- **Invoices** (document icon): search past sales, re-open an invoice, or **Refund** (manager & owner only).
- Refunds mark the sale as refunded, optionally **restore stock** to inventory; **cash/mobile money return is manual** at the register.

## Data storage (offline-first)

| Layer | Technology |
|-------|------------|
| **Primary (desktop)** | SQLite via `@tauri-apps/plugin-sql` — products, sales, settings with `id` (UUID), `updated_at`, `sync_status` |
| **Dev fallback** | `localStorage` when not running inside Tauri |
| **Users / auth** | `localStorage` (until portal accounts exist) |
| **Cloud (planned)** | PostgreSQL on your portal — see [docs/SYNC.md](docs/SYNC.md) |

The desktop app includes a manual **Cloud sync manager** under **Settings** for configuring the portal API and pushing pending local changes.

### Receipt types (SDC-ready)

- **NORMAL** + SALES / REFUND — fiscal sales and refunds  
- **COPY** + SALES / REFUND — reprints from invoice history (copy counter increments)  
- **TRAINING** + SALES / REFUND — practice mode (Settings → Training mode); no fiscal value  
- **PROFORMA** + SALES only — quote from POS before payment (not saved as a sale)  

Plain-text and PDF/print layouts include the SDC code (e.g. `RT_NORMAL_SALES`).
=======
# sepela-ERP
Sepela Screen Checkout Offline First Desktop Application
>>>>>>> 01e8fc1ae7bf24f57a05d2a29cdf43de61664bfd
