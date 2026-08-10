# Saleis.live — Architecture principles (v1)

> Written down 2026-08-10 at Ola's explicit request: **these are constraints for future architecture, not a build list.** Nothing here should be implemented until she asks for it by name — the point is that today's data model and routing don't quietly foreclose any of it later. Where the current code already satisfies (or already contradicts) a principle, that's noted inline so nobody has to re-derive it from scratch next time.

## 1. Tenant is not Brand

The saleis.live customer is a company/tenant, not a brand name. One tenant may eventually own multiple brands, sales, storefronts, domains, and users:

```
Tenant → Brand(s) → Sale(s)/Storefront(s) → Product(s)
```

No tenant, brand, or sale should ever be identified by its display name — every one needs a stable internal ID that never changes even if the name does.

**Current state:** already structurally true. `Tenant` and `Brand` are separate Prisma models; `Brand.tenantId` is a real foreign key (nothing enforces 1 brand per tenant); every brand/product/order/campaign row carries its own `id` (cuid or `b_`/`p_`-prefixed), never the slug or display name, as primary key. One inconsistency: the demo seed data uses literal SKUs ("P001") as the product's own `id` — harmless for seed data, but don't copy that pattern for real merchant data.

## 2. Brand-name protection

A seller shouldn't be able to spin up `nike.saleis.live` and present themselves as Nike's official channel just by typing the name into the brand-setup form.

Needs to be representable later (admin-handled at first, no automated verification required now):
- `brand_verification_status`
- `verified_at`
- `verified_by`
- separate records for verification documents

**Current state:** `Brand.slugVerified: boolean` already exists as a placeholder field, but nothing sets it to `true` (every brand created via the "New brand" form is unverified) and nothing gates on it — a merchant can publish a storefront regardless. No verification workflow, no documents table, no admin review screen yet. This is a real, currently-open gap, not just an unbuilt nice-to-have — flagged here rather than quietly left implicit.

## 3. Subdomain ≠ identity

`brand.saleis.live` is a public address, not the company's identity. The slug must be unique and changeable; two companies named "Luna" can both display "Luna" while living at `luna.saleis.live` and `luna-ae.saleis.live`.

**Current state:** already true. `Brand.slug` is `@unique`, distinct from `Brand.name`; nothing in the schema treats the slug as identity.

## 4. Custom domains, eventually

An enterprise client should eventually be able to use `sale.brand.com` instead of `brand.saleis.live`. Tenant routing must not be hard-wired to `*.saleis.live` only.

**Current state:** `Brand.customDomain: string | null` already exists on the domain type — but `apps/api/src/middleware/tenantRouter.ts`'s `resolveTenant` only ever matches `host.endsWith(".${rootDomain}")`; it never checks `customDomain` at all. So the field is there, the routing isn't. Wiring that in later is additive (one more branch in `resolveTenant`), not a rearchitecture — but worth knowing it's not live today.

## 5. Tenant data isolation is a backend guarantee

Products, sales, orders, storefronts, users, assets, and config for tenant A must never be reachable by tenant B — enforced server-side, never just hidden in the UI.

**Current state:** this is the pattern already in active use — every store function takes/filters by `brandId`, every route resolves `brand` from an authenticated/host-resolved context before querying, and this session's role work (`ROLE_NAV_ACCESS`, `requireRole`, per-brand `BrandMembership`) enforces it at the API layer, not just by hiding nav items. Keep extending new routes the same way.

## 6. Product photos belong in object storage, not the database or local disk

Images/files should go to scalable object storage (S3-compatible or similar); the database holds references + metadata only. Storage layout should stay tenant-aware: `tenant → brand → sale/product → assets`, scaling independently of the app and database.

**Current state — real, current gap, not hypothetical:** today's file storage (`apps/api/src/lib/assetStorage.ts`, used by both the Excel embedded-photo extractor and Product Studio's "Add a photo") writes straight to local disk (`apps/api/public/assets/uploads/`), served via `express.static`. That's fine for the current single-instance Render deployment and demo/testing, but it does **not** satisfy this principle: local disk doesn't scale across multiple instances, isn't tenant-partitioned, and is lost if the instance is recreated. Migrating `saveUploadedAsset` to write to S3-compatible storage (e.g. Cloudflare R2, AWS S3) instead of `fs.writeFile`, keeping the same function signature, is the natural later step — flagged now specifically because it's the one principle this session's own work is currently in tension with.

## 7. A sale has a lifecycle, not just exists/deleted

Something like `draft → scheduled → live → ended → archived`. Ending a sale must never silently hard-delete order/transaction history.

**Current state:** already close. `CampaignStatus` is `"draft" | "scheduled" | "live" | "ended" | "canceled"` — everything except a distinct `archived` stage (today "ended" is the terminal state). No hard-delete path exists for campaigns or orders today regardless. Adding `archived` later is a small enum change, not a rearchitecture.

## 8. Data retention should be configurable later

Different plans/customers may need different retention: `active → archive → cold storage / delete certain assets after a set time`. Ending or removing a storefront must never auto-delete business/transaction history.

**Detail Ola gave for photos specifically** (kept verbatim as the reference shape for whenever this gets built):

```
LIVE            → everything active
  ↓
ARCHIVED        → data kept, storefront turned off
  ↓ 90/180 days
COLD ARCHIVE /   → photos deleted or moved to cheaper storage
DELETE ASSETS
  ↓
legally/accounting-required data stays per the applicable retention policy
```

"Archive indefinitely" could become a paid-plan feature — noted as a pricing-model idea, not a commitment.

**Current state:** not implemented; nothing today deletes anything automatically, so there's no active violation — just unbuilt.

## 9. Excel first, API later — Excel is an import method, never the source of truth

Onboarding can stay Excel/CSV → saleis.live for now. Later, the same product/inventory data may arrive directly from an ERP/WMS/PIM/ecommerce platform via API. After import, everything must live in saleis.live's own standardized product/inventory model — never re-read from the original file — so the input method (Excel today, API later) can be swapped without rebuilding the product.

**Current state:** already the actual design. Import (`packages/domain/src/import.ts`, `apps/api/src/lib/importParsing.ts`) parses a file into `ParsedImportRow` → diffs against the stored `Product` → writes into the normal `Product` table. Nothing downstream reads the original file again. A future API-based intake method would plug in at exactly the same `ParsedImportRow`-shaped seam Excel uses today.

---

## Open items noted alongside this, not yet built

- **A scoped "developer" role** for connecting payment/courier integrations (Launch Studio's Payments/Delivery tabs) without granting full Brand Admin access to pricing, catalogue, and team management. Today only `brand_admin`/`group_owner` can touch that screen at all — there's no "just the integrations" role. A real gap in the role model, not just a future nice-to-have; worth building whenever a real technical contractor needs this.
- **Real domain/DNS hookup** — connecting `*.saleis.live` wildcard DNS (and eventually custom domains, principle 4) so the team can work against real subdomains instead of localhost. This needs Ola's decisions about the DNS provider/registrar and Render's custom-domain configuration; not something to wire up unilaterally.
- **PWA** — flagged by Ola as a topic to return to; not detailed yet in this note.
- **AI customer-support agent** — Ola's idea: some form of AI agent answering buyer questions on the storefront (web) and potentially by phone, given real questions will come in once brands go live. Not scoped or committed — noted as a direction to think through later, alongside the earlier creative-simplicity-audit's own ideas.
