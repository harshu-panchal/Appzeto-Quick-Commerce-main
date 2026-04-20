# Finance Migration Plan (Existing Orders)

## 1) Backup
- Take a full MongoDB backup before migration.

## 2) Seed Finance Settings
- Run:
```bash
node scripts/seed-finance-settings.js
```

## 3) Backfill Old Orders
- Run:
```bash
node scripts/migrate-order-financial-snapshots.js
```
- This adds `paymentMode`, `paymentStatus`, `paymentBreakdown`, `pricingSnapshot`, `distanceSnapshot`, `settlementStatus`, `financeFlags` to legacy orders.

## 4) Validate Backfill
- Spot-check sample orders:
  - online completed orders -> `paymentStatus = PAID`
  - cash delivered orders -> `paymentStatus = CASH_COLLECTED`
  - `paymentBreakdown.grandTotal` present

## 5) Deploy New API + Frontend
- Deploy backend first, then frontend wallet/settings updates.

## 6) Optional Reconciliation
- Use `/api/admin/finance/ledger` and `/api/admin/finance/summary` to verify totals.
