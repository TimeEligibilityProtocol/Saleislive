# Saleis.live

White-label multi-tenant SaaS for launching branded live sales in minutes. See `docs/product/saleis-live-blueprint-v1.md` for the full product blueprint and `docs/product/saleis-live-visual-brand-kit.docx` for the platform brand kit (colors, type, logo mark).

**Not related to wearto.you** (a separate C2C marketplace repo/product) — Saleis.live is B2C: brands sell to their own customers through storefronts this platform hosts. The two repos share some proven building blocks (see below) but are otherwise independent.

## Step 0 — what exists right now

- `packages/domain` — core types: multi-tenant model (`Tenant`/`Brand`/`BrandMembership`/`Role`), `Product` with the AI-suggestion/approved-value split, `ImportBatch` staging/diff model, `ThemeTokens`, `Campaign`, `Order`/`InventoryReservation`, and the `PaymentAdapter`/`DeliveryAdapter` interfaces (payments and delivery are integration points the platform exposes — never operated by Saleis.live itself, see blueprint §8).
- `packages/ui` — platform chrome design tokens from the brand kit (ink `#111111`, ivory `#F5F2EB`, ultramarine `#173B8F`, Inter + Instrument Serif). This is the Saleis.live platform's own look, not a tenant's storefront theme — those are data-driven via `ThemeTokens`.
- `packages/api-client`, `packages/platform` — thin API client and platform-capability interfaces, same pattern as wearto.you.
- `apps/api` — Express API with a working **tenant router**: resolves which brand a request belongs to from its `Host` header (`chanel.saleis.live` → brand `chanel`), a brand-creation endpoint with live slug-availability checking, and a `/api/storefront/me` endpoint the storefront will call to know which brand it's rendering. Seeded with one demo brand so we can self-test without waiting on real client files (see blueprint §13 note — Discovery is step 1, but Import can be built and tested against files we create ourselves in parallel).
- `apps/admin` — working "Launch your own marketplace" screen (name → live slug check → create), built to satisfy the blueprint §12 acceptance criterion: *"Pracownik tworzy brand workspace, dodaje logo i otrzymuje podgląd bez kontaktu z supportem."*
- `apps/storefront` — working buyer-facing storefront: resolves its brand from the page's own Host header (same tenant router as the API — `demo.localhost:5274` renders "Demo Brand" the same way `demo.saleis.live` will in production) and renders that brand's live product grid from `/api/storefront/products`. Seeded with 4 demo products (placeholder SVG images, not real photos) so there's something real to look at before Import exists.

## Reused from wearto.you (proven, not rebuilt from scratch)

- **Background & crop** AI module — wearto.you's `apps/api/src/routes/backgroundRemoval.ts` + `apps/marketplace/src/lib/backgroundRemoval.ts`. Real segmentation model (ONNX, no external API/key), already fought through the hard bugs: Metro can't bundle onnxruntime-web (must run server-side), phone photos need EXIF-orientation normalization before segmentation, near-empty masks need a coverage sanity check, and the model needs ~2GB RAM (crashes under 512MB free-tier hosting).
- The `AiAssistedField<T>` pattern (AI suggestion vs. human-approved value, kept separate everywhere).
- Session-auth pattern (scrypt password hashing, server-side sessions) as a starting point — Saleis.live's real requirement (6 roles, per-brand membership) is more complex and still to be built.
- Deployment knowledge: Render config pattern, `EXPO_PUBLIC_*`/env-var-driven API base URLs, wildcard-subdomain hosting considerations.

## Not built yet (see blueprint §9 MVP scope and §13 build order)

Excel/CSV import pipeline (the *standard* way products enter the system — a single-photo flow like wearto.you's Magic Listing is optional/secondary here, not primary), AI orchestration beyond background removal (not yet ported), Theme Studio UI, campaigns/checkout/inventory-lock, payment/delivery adapter implementations, RBAC beyond the type definitions, real wildcard DNS + production subdomain hosting.

## Getting started

```bash
npm install
npm run build:packages

# API — PLATFORM_ROOT_DOMAIN=localhost makes brand.localhost resolve
# the same way brand.saleis.live will in production (browsers treat
# *.localhost as loopback automatically, no /etc/hosts editing needed).
cd apps/api && PORT=4100 PLATFORM_ROOT_DOMAIN=localhost npm run dev

cd apps/admin && npm run dev        # http://localhost:5273
cd apps/storefront && npm run dev   # http://demo.localhost:5274 (or any other seeded brand slug)
```
