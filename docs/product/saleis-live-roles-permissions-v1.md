# Saleis.live — Roles & Permissions (draft v1)

> Working draft for consultation — not final. Roles and permissions are stored as plain data (not hardcoded logic), so anything here can change later without rebuilding the system: renaming a role, splitting a permission into two, adding a brand-new role, or changing who can do what is a configuration change, not a rewrite.

## How access works, in plain terms

- **Every person has their own login** (email + password). Nobody shares an account.
- **The brand owner decides how many people have access — zero, one, or many.** A solo owner can do 100% of the work alone under one login. Or the owner can invite any number of teammates and give each one a role that limits exactly what they can see and do.
- **A role is not "seniority" — it's a permission scope.** Two roles can be equally "important" but see completely different parts of the app (e.g. Order Manager and Analyst don't overlap at all).
- **Roles are assigned per brand.** The same person could have a different role on a different brand, if the group owns more than one.
- **The owner (or Brand Admin) can change anyone's role at any time**, or remove their access entirely. Nothing here is permanent.

## Role → permission matrix

| Area | Group Owner | Brand Admin | Merchandiser | Order Manager | Analyst | Read-only |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Brand setup (name, domain, country, currency) | ✅ edit | ✅ edit | ❌ | ❌ | ❌ | 👁 view |
| Stock intake / Excel-CSV import | ✅ edit | ✅ edit | ✅ edit | ❌ | ❌ | 👁 view |
| AI Catalogue Review (product data, prices, photos) | ✅ edit | ✅ edit | ✅ edit | ❌ | ❌ | 👁 view |
| Launch Studio (campaign setup) | ✅ edit | ✅ edit | ✅ edit | ❌ | ❌ | 👁 view |
| Preview & Publish | ✅ edit | ✅ edit | ✅ edit | ❌ | ❌ | 👁 view |
| Orders (view, advance fulfilment, refund, cancel) | ✅ edit | ✅ edit | ❌ | ✅ edit | ❌ | 👁 view |
| Dashboard / sales statistics | ✅ view | ✅ view | ❌ | ❌ | ✅ view | 👁 view |
| Payments & delivery integration (Settings) | ✅ edit | ✅ edit | ❌ | ❌ | ❌ | ❌ |
| Approve/reject a submitted setup step | ✅ | ✅ | ❌ (can submit, not approve) | ❌ | ❌ | ❌ |
| Invite/remove team members, change roles | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Read-only** sees everything listed above but can never save, submit, approve, or publish anything — a safe role for e.g. an investor, accountant, or someone who just needs visibility.

## Concrete examples (from our conversation)

- **Solo operator:** owner alone, Group Owner role, does all 5 setup steps and submits+approves their own each step. No team invites needed.
- **Warehouse/stock person:** invited as **Merchandiser**. Logs in, sees only Stock Intake / Catalogue Review / Launch Studio / Preview & Publish. Cannot see Dashboard, Orders, or Settings at all — those menu items simply aren't shown to them.
- **Analyst:** invited as **Analyst**. Logs in, sees only the Dashboard with sales numbers. Cannot touch products, orders, or anything editable.

## Open questions to resolve after consultation

- Should Merchandiser also be able to see Orders (to know what's selling)? Currently: no.
- Should Analyst be able to see the product catalogue (not just sales numbers)? Currently: no.
- Should there be an "Order Manager can also see Dashboard" carve-out, since fulfilment often needs sales context? Currently: no.
- Exporting statistics (CSV/Excel download of sales data) is **not built yet** — flagged separately, not part of this permission model.
- Reconciling warehouse stock *after* a sale ends (syncing back to the brand's own inventory system) is **not automated yet** — today a merchant re-uploads an updated spreadsheet through the same Stock Intake import flow, which diffs and updates existing stock numbers. A live ERP/WMS connector is explicitly listed as post-MVP in the main product blueprint (§9), not something we're building into the first version.
