# Data model

All data is in the browser's IndexedDB database **`pos-db`**, version **4** (`web/js/db.js`). Every store
uses `id` as its key, except `meta`, which uses `key`.

| Store | Key fields | Notes |
|---|---|---|
| `products` | `id, name, barcode, price, cost, unit, category, stock, reorder, created, updated` | Index `barcode`. `cost` may be `''` (unknown). |
| `sales` | `id, no, time, items[], subtotal, discount, total, method, methodLabel, cash, change, credit, customerId, customerName, cashier, cashierId, shiftId, note, voided, voidReason` | Indexes `time` and `customerId`. `items[]` holds `{productId, name, price, cost, unit, qty, custom?}`. A custom item has `productId` `custom:…`. |
| `receivings` | `id, no, time, supplier, invoiceNo, receivedBy, notes, lines[], total, voided` | Index `time`. Posting adds stock and updates cost and price. |
| `customers` | `id, name, phone, email, address, limit, …` | The balance is computed from sales `credit` minus payments. It is never stored. |
| `payments` | `id, customerId, amount, method, methodLabel, time, cashierId, shiftId, voided` | Index `customerId`. These are payments against credit (utang). |
| `staff` | `id, name, role ('admin'/'cashier'), active, salt, pinHash, created, updated` | `pinHash` is `p2$` + PBKDF2. See [SECURITY.md](SECURITY.md). |
| `shifts` | `id, no, openedAt, openedBy, openedById, openingCash, moves[], closedAt, closedBy, expected, counted` | `moves[]` holds `{type:'in'/'out', amount, note, time}`. |
| `meta` | `{key, value}` | See the next table. |

## `meta` keys

| Key | Holds |
|---|---|
| `store` | Settings: `name`, `address`, `phone`, `tin`, `footer`, `currency`, `decimals`, `color`, `logo` (a data URL), `cashier`, `lang`, `methods[]`, `allowCredit`, `useShift`, `autoLock`, `theme` |
| `printer` | Printer settings |
| `seq`, `rcvSeq`, `shiftSeq` | Running numbers for receipts, receivings and shifts |
| `soldCount` | Counts that rank the quick-pick tiles |
| `lastBackup` | When the last backup was saved |
| `cloud`, `cloudHashes` | Cloud connection and the hashes of what was already sent. These are **never** exported to a backup file and are kept when a backup is restored. |

## Money

`Receipt.decimalsOf(store)` gives 3 decimals for BD/BHD/KWD/OMR and 2 for other currencies. The store's
`decimals` setting overrides it. Use `r2()` to round and `money()` to show amounts.

## Shift cash math

```
expected = openingCash + cash sales + cash down-payments on credit sales
         + cash credit payments + cash in − cash out
difference = counted − expected      (negative = short, positive = over)
```

## Backups

`DB.exportAll()` returns this object:

```
{ app: 'pos', format: 4, exported, products, sales, receivings, customers, payments, staff, shifts, meta }
```

`DB.importAll(data)` replaces everything with the backup's contents. It checks the input first:

- Only records with a safe `id` (`/^[\w.:-]{1,80}$/`) are imported.
- `meta` must have a string `key`.
- The cloud connection keys are kept.

Older formats (1–3) still import. Missing stores are treated as empty.

## Changing the schema

1. Bump `VERSION` in `db.js`.
2. In `onupgradeneeded`, create the new store or index only when it is missing. Upgrades run from any older version.
3. Add the store to `STORES`. Export, import and wipe use that list.
4. Bump `format` in `exportAll`, and keep `importAll` tolerant of files that don't have the new store.
5. If the cloud should see the new store, add it to `KINDS` in **both** `web/js/cloud.js` and the Edge Function.
   Also update the `docs.kind` check constraint with a new migration.
