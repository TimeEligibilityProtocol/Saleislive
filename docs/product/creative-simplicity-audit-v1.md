# Saleis.live — Creative Simplicity & Innovation Audit (v1)

> Written in response to Ola's ask: find where the product could be radically simpler, and where it could be genuinely surprising — not a generic "add tests, improve error handling" list. Grounded in the actual code, not the aspiration. Every idea names the exact screen/flow it touches, whether it's a small reframe or a real build, and — per her follow-up note — **exactly where and when in the real flow it should first appear**, so it reads as the next natural step rather than a bolted-on screen. Her own mid-session product ideas (PWA per brand, AI Stock Rescue, Instant Pop-up Store, the later TEP timing hook) are folded in as fully evaluated ideas, not appended separately.

## Method — what I actually read before writing this

`docs/product/saleis-live-blueprint-v1.md` (full), `docs/product/saleis-live-roles-permissions-v1.md` (full), `apps/admin/src/App.tsx` (2,432 lines, all of it), `apps/storefront/src/App.tsx`, `apps/marketing/src/App.tsx` (the "systems bridge" section), `apps/api/prisma/schema.prisma`, `apps/api/src/routes/{setupSteps,analyzeProduct,imports}.ts`, `apps/api/src/middleware/{auth,tenantRouter}.ts`, `apps/api/src/lib/importParsing.ts`, `packages/domain/src/{product,theme}.ts`.

**What's real vs. aspirational, because this matters for what's cheap to change:**

- **Real and working:** brand creation, Excel/CSV import with column-mapping preview → staged diff → commit, manual single-product add, per-product "Suggest with AI" (one photo → color/material/category/description via a live Claude vision call in `apps/api/src/routes/analyzeProduct.ts`), Catalogue Center readiness tabs, Launch Studio (sale/store/payments/delivery/policies), Preview & Publish checklist, Orders + fulfilment states, a 5-step setup wizard with submit/approve tracked in `BrandSetupStep`, and a real per-brand subdomain router (`tenantRouter.ts` resolves `chanel.saleis.live` → brand `chanel` from the `Host` header — this turns out to matter a lot for the PWA idea below).
- **UI present but not wired to anything:** 4 of the 6 "Add stock" intake tiles (product photos, ZIP, images-in-spreadsheet, **phone/camera**) just record an intent row and say "queues for Catalogue Center" — `REAL_INTAKE_METHODS` in `App.tsx:409` is only `["excel_csv", "manual"]`. Background removal, OCR, image-quality check, translation, batch AI catalogue review, AI Brand Composer — all blueprint §5/§6 items, all unbuilt.
- **Not built at all:** any notification channel (no email/SMS/WhatsApp adapter exists despite being named in blueprint §10's architecture table), any mobile layout for the *admin* specifically (zero `@media` queries anywhere in `apps/admin/src/App.tsx`, fixed 232px sidebar + 40px page padding + 3-column grids + 320–340px fixed-width side panels). Interestingly the **storefront already has a couple of mobile media queries** (`apps/storefront/src/App.tsx:122–129`, logo/brand-name swap under 480px) — so the buyer-facing side has at least started thinking mobile-first; the merchant-facing admin has not, at all.
- **Blueprint-committed but not built:** PWA. Blueprint §9's MVP scope row literally says *"Storefront: 3 motywy, brand tokens, **PWA/responsive**"* and §10's architecture table lists *"Web/PWA: Admin i storefront."* This isn't a new idea being proposed from nothing — it's a shipped promise with no manifest, no service worker, no install prompt anywhere in the repo yet.

That last set of points matters: Ola's "unusable on a phone" complaint about the admin isn't an exaggeration — it's never had a breakpoint. And PWA isn't a stretch idea — it's already promised and unbuilt, which is exactly why it's worth prioritizing now rather than later.

---

## The credibility gap worth naming first

The blueprint's core promise is "**Three clicks to publish**" and "10–20 minutes" for a first campaign. The built reality is 5 wizard steps, each its own page, several with 6–10 fields across a 3-column grid plus sub-tabs (Launch Studio alone has 5 tabs). Not a criticism of the engineering — the staging/diff/audit rigor is genuinely good and shouldn't be cut — but it means "three clicks" is currently aspirational copy, not a description of the product. Camera-first intake, AI Stock Rescue, and the solo-operator auto-approve fix below are the concrete path to actually earning that claim for the merchants it's true for.

---

## Small simplifications — do these soon

### 1. Solo operators shouldn't submit-then-approve themselves
**Where/when:** every one of the 5 setup-wizard steps, the moment a brand has exactly one member.
The roles doc's own example says it out loud: *"Solo operator: owner alone, Group Owner role, does all 5 setup steps and submits+approves their own each step."* That's ceremony with no function. **Fix:** in `apps/api/src/store/setupSteps.ts`, when a brand has exactly one membership, collapse `submit` + `approve` into a single action (still logged to `AuditLog`) and only start requiring the two-step dance the instant a second, lower-ranked person actually joins. No new schema, no new role concept — it should feel like the button just says "Done" instead of "Submit," and there's no separate approval screen to notice was ever skipped.

### 2. Stop front-loading decisions before the merchant has seen any payoff
**Where/when:** `AddStockPage`, the moment the merchant lands on "Add stock" — before they've picked a file.
"How should we match photos?" and "What should happen to product photos?" (`App.tsx:643–664`) are shown *before* a file is even chosen — two decisions about data they haven't uploaded yet. Move both under a collapsed "Advanced" disclosure that defaults to sensible choices (SKU match, quality-check-only), and only surface it after the preview table renders — i.e. once the merchant has already seen their own data land successfully. The natural trigger to *show* it at all is "the merchant scrolled to Advanced," not "the merchant opened the page."

### 3. Turn the column-mapping table into single-row cards on narrow screens
**Where/when:** the mapping-confirmation screen (`App.tsx:703–744`), automatically once viewport width crosses ~640px — no user action triggers it, it's a pure breakpoint.
On a 375px phone this is a horizontally-scrolling 4-column table with tiny `<select>`s. Below ~640px, render one stacked card per header (source column → target field selector → example value) instead of a table row. Contained, no new logic, just a breakpoint on an existing loop.

### 4. Give the merchant back their own "10–20 minutes" claim, live
**Where/when:** a small persistent readout in `AdminShell`, visible throughout the wizard the instant `CreateBrandPage` is submitted (i.e. the moment `BrandSetupStep` rows first exist) — not shown before then, since there's nothing to count yet.
A quiet "Step 3 of 5 · 6 min so far" turns the blueprint's boasted number into something the product proves to the user in real time, using timestamps `BrandSetupStep` already has. It should disappear once Preview & Publish is reached and replace itself with the final elapsed time as a one-line congratulatory note — the reward moment, not a persistent nag afterward.

### 5. Let a Group clone a configured brand instead of re-running the wizard
**Where/when:** `CreateBrandPage` (`App.tsx:198`) — the instant the founder is creating a *second* brand under a tenant that already has one. Detect this (tenant already owns ≥1 brand) and, above the empty form, offer "Start from [existing brand name]" as an alternative to the blank form — never shown to a brand's very first setup, since there's nothing yet to clone.
Copies theme preset, policies, payment/delivery adapter config; deliberately never copies products or campaign. Brand #2 through #N become "just Stock Intake," skipping 3 of 5 steps.

---

## Big swings — need real discussion before building

### A. PWA per brand — installable, one shared engine (prioritize this)

**Directly the founder's own idea, given real technical depth as requested.** **Replaces:** nothing existing — this is pure addition on top of the storefront, and it's already promised in blueprint §9/§10 as unbuilt.

**The pipeline, matched to what already exists:** her framing — *existing merchant system → Excel/CSV → saleis.live AI → branded storefront → installable PWA* — maps directly onto the pipeline already built: `Add Stock` import → `Product`/`Campaign` records → the storefront app (`apps/storefront`) reading them via `tenantRouter`. The only missing link is the last one: turning that already-branded storefront into something a buyer can add to their home screen.

**Is Vite's PWA plugin + a per-brand dynamic manifest enough, or does subdomain scoping need something trickier?** Genuinely good news here: **it's easier than it looks**, precisely *because* of a decision already made elsewhere in the codebase. `tenantRouter.ts` resolves brands from real per-brand subdomains — `chanel.saleis.live`, `maisonnoura.saleis.live` — not a shared origin with a `?brand=` query param. Service workers and PWA installability are scoped by browser same-origin policy, and each brand subdomain **is already its own origin**. That means the hard problem people usually hit with multi-tenant PWAs — one service worker accidentally serving or caching the wrong tenant's content — mostly doesn't exist here; the isolation is already structural, for free.

What's actually needed:
- **One static, brand-agnostic service worker** (`sw.js`) — caching strategy doesn't need to vary per brand, so this is a single file, built once via Vite's PWA plugin or by hand, same for every subdomain.
- **A per-brand *dynamic* manifest**, not the static `manifest.json` the PWA plugin generates by default. `index.html` can statically reference `<link rel="manifest" href="/manifest.webmanifest">` — the trick is that route itself must be server-resolved (a small Express route in `apps/api`, or a thin edge middleware in front of the static storefront build) using the exact same `req.brand` that `tenantRouter` already resolves from the `Host` header, returning `name`/`short_name` from `Brand.name`, and `theme_color`/`background_color` straight from `ThemeTokens.primaryColor`/`backgroundColor` (`packages/domain/src/theme.ts:17–28`) — those fields already exist for exactly this purpose, just not consumed yet.
- **The one real gap: icons.** `ThemeTokens.logoUrl` is an arbitrary-shaped brand logo, not a squared 192×192/512×512 maskable icon. Needs a small icon-generation step (pad/center the existing logo onto a square canvas, ideally at upload time in Launch Studio rather than per-request) — small, not a rearchitecture.

**Where/when the buyer actually encounters this — reasoned from real platform constraints, not in the abstract:** iOS Safari (a large share of the target region's buyers) has **no programmatic install prompt at all** — the only thing possible there is a hint card ("tap Share → Add to Home Screen"); Android Chrome can trigger a real `beforeinstallprompt` button on command. Given that split, prompting on the very first anonymous visit is the wrong moment twice over: it interrupts someone who hasn't decided whether they like the brand yet, and on Android a dismissed prompt gets suppressed by the browser for a while, wasting the one good shot. The natural trigger is **right after order confirmation** (`ConfirmationView`, already the screen at `#/order/:id` in `apps/storefront/src/App.tsx`) — the buyer has just committed money and trust, "save us to your home screen to track this order and catch the next sale" reads as earned, not cold. A secondary, quieter trigger: a light nudge only on a *second* visit to the storefront root (tracked via a local visit flag), never the first. On iOS this is the instructional card at the same two moments, not a fake button.

**Why this is the right one to prioritize:** it's the one idea here that needs no new AI, no new adapter, no new role/permission thinking — just wiring together two things that already exist (per-brand subdomains, brand theme tokens) into a manifest route and one shared service worker. It's also the cleanest version of "no app development, still an app" for a brand's story to investors or its own customers, and it directly closes an already-promised blueprint gap rather than opening a new one.

### B. AI Stock Rescue — two moments, not one screen

**The founder's named feature, evaluated end to end.** Her philosophy — *"Excel first. API when you're ready"* — already has a home in the product: the marketing site's own "systems bridge" section (`apps/marketing/src/App.tsx:36,388–400`) already ends on the line *"They all speak Excel. saleis.live starts there."* Rescue is the natural payoff of that line turned into an actual in-product feature, not a new positioning idea.

**Rescue Scan (Tier 1 — build first, point-in-time, no integration).** The key realization from reading the actual flow: this is **not** a step that belongs after the merchant already knows what they're importing — by the time someone reaches the normal Excel/CSV or manual intake tiles on `AddStockPage`, they've already decided what's going into the sale. Rescue Scan answers an earlier question — *"I don't know yet what should even be on sale"* — so it belongs as a **second doorway on the same screen**, not a downstream step. Concretely: add a distinct card above or beside the existing `INTAKE_TILES` grid on `AddStockPage` — *"Not sure what to put in a sale? Upload your full stock list and let AI find likely candidates"* — which takes a broader export (SKU, quantity, price, date received, category, ideally sales history) than the normal import expects, and returns a triage report, not a staged `ImportBatch` commit: *"327 of 1,240 SKUs look like sale candidates — slow movers, aging stock, overstock."* The merchant multi-selects from that report, and only the selected subset flows into the exact same staged-diff pipeline the normal Excel path already uses. This means Rescue Scan is a new *front door*, not a new pipeline — it reuses `parseSpreadsheet`/`ImportBatch` staging end to end, with one new triage/scoring pass in front of it.
**Why here and not after the import diff:** showing "327 candidates" after a diff the merchant has already committed to would be confusing and too late to act on cleanly; showing it before they've chosen anything is exactly when triage is useful.

**Rescue Watch (Tier 2 — later, continuous, needs live API/ERP connection).** This is functionally the same concept as idea F below (a decay-aware assistant) applied *before* a campaign exists rather than during one — worth naming as one feature with two moments rather than two separate features. **Where it surfaces:** once a brand has a live integration, `DashboardPage`'s existing "Action queue" panel (`App.tsx:2215–2219`, already a flat list like *"3 orders require fulfilment"*) is the natural home — Rescue Watch just becomes a new item type in a list mechanism that already exists (*"14 SKUs newly flagged as aging stock — start a sale?"*), appearing unprompted when the underlying data changes, not on a schedule the merchant has to remember to check. This is deliberately **not** a new screen — surfacing it anywhere else would make it feel bolted on; surfacing it in the queue that already exists makes it feel like the dashboard just got smarter.

**Scope:** Tier 1 is a real but contained build — one new upload+scoring endpoint, one new triage-report UI, wired into the existing staged-import pipeline at the point of selection. Tier 2 depends entirely on the (currently nonexistent) ERP/WMS/PIM connector work already flagged as post-MVP in blueprint §9 — correctly sequenced as "later" by the founder herself.

### C. Camera-first stock intake: make the phone the input device, not a shrunk desktop form

**Where/when:** the existing, currently-inert **"Phone / camera"** tile on `AddStockPage` (`App.tsx:388`, one of the six `INTAKE_TILES`) — the natural trigger is simply tapping that tile, exactly like today, except it now does something. No new entry point needed; this is the tile everyone will eventually tap on a phone standing in a stockroom, and today it silently does nothing.

**What exists already that this builds on:** the vision AI call in `apps/api/src/routes/analyzeProduct.ts` is real and already extracts color/material/category/description from one photo — it's just currently wired to fire only from inside Product Studio, one photo at a time, after a product already exists.

**The idea:** tapping "Phone / camera" opens a continuous-capture view — point at an item, shutter, next item — and each photo becomes a draft product with AI-suggested fields already filled via the same call that already exists, marked `image_ai` sourced (the provenance system for this, `AiAssistedField` with `sourceType: "image_ai"`, is already fully built in `packages/domain/src/product.ts` — nothing new needed there). The merchant is only asked for the two things AI is correctly forbidden from inventing — price and stock count — as one quick tap per item at the end of the session, ideally by voice ("twelve") so hands stay free.

**Why it's simpler for this exact user, not just novel:** Excel requires data the merchant often doesn't have typed up yet; a camera requires nothing they don't already have in their hand. It also collapses two wizard steps into one: Stock Intake and AI Catalogue Review become the same continuous action instead of sequential pages.

**Scope:** real build — continuous-capture mobile UI, batching multiple `analyze-photo` calls into one `ImportBatch` session, extending manual-product-create to accept AI-derived defaults — but it reuses the existing AI call and the existing staging/diff/audit machinery, and lands on a UI slot that's already there waiting.

### D. Approval without a login: a tappable link instead of a dashboard session

**Directly answers Ola's role/approval question.** **Where/when:** the moment any non-solo brand's `submit` action fires on a `BrandSetupStep` (`apps/api/src/routes/setupSteps.ts`) — today that only flips a status flag the approver has to notice by logging in and navigating to find it; the link should be *sent* at that exact moment, not discovered later.

**The idea:** generate a signed, single-use, expiring link tied to that one submitted step. Send it via whatever channel the approver actually checks (see idea F). Tapping it opens a minimal, unauthenticated-but-token-gated page showing exactly what changed — the diff, not the dashboard (*"12 products moved to ready, headline set to 'Summer Private Sale,' 3 items still missing photos"*) — with two buttons: Approve / Reject-with-reason. The token *is* the auth for that one decision; no standing account, no password, no nav, ever, for someone whose entire relationship with the product is "glance and tap yes."

**Why it's simpler AND more innovative, not just different:** simpler because the approver's task shrinks from "log into a SaaS dashboard, find the right screen" to "open the message, read the summary, tap once." Novel for this space because every competitor's RBAC model assumes the approver is also a dashboard user; nobody treats "approve" as a single-purpose, notification-native action.

**Scope:** contained — one new short-lived token concept tied to `BrandSetupStep`, one public token-gated route pair. No new role concept; it's an alternate front door to the exact `submit`/`approve`/`reject` state machine that already exists.

### E. Instant Pop-up Store — a QR-first campaign, not a new subsystem

**The founder's idea, mapped onto what already exists.** Reading `Campaign`'s schema (`CampaignAccess`: public/private/invite/password; `startsAt`/`endsAt`; `productIds`) shows this is structurally *already* a campaign — a pop-up is just "campaign, but access = show-a-QR-not-a-URL, and duration defaults to hours not weeks."

**Where/when:** Launch Studio's **Sale tab**, in the exact access-type control that already exists (`CAMPAIGN_ACCESS_OPTIONS` pill row, `App.tsx:1446`) — add "Pop-up (QR, on-site)" as a fifth option alongside public/private/invite/password. Choosing it does two small, contextual things right where the merchant already is: defaults `endsAt` to +48h instead of open-ended, and swaps Preview & Publish's "Publish now" affordance for a large scannable QR code instead of a copy-link button — because at that point sharing a link makes no sense, but showing a code on a tablet at the event does.

**Why this is small-to-medium, not a new feature:** it reuses Campaign, Launch Studio, and Preview & Publish end to end — the only genuinely new piece is QR generation (a small, well-understood client-side or one-endpoint job) and the "expires and disappears" framing, which `endsAt` and `CampaignStatus: ended` already support. It earns its "instant" name honestly: a merchant who's mid-way through configuring a normal sale is two taps from a pop-up, not in a separate flow they have to discover.

### F. WhatsApp as a first-class second interface, not just a future notification channel

**The single strongest "nobody does this" idea, because it's the one most specific to this product's actual market.** Blueprint §10's architecture table already lists "e-mail/SMS/WhatsApp" as a planned adapter — but only outbound. The countries in the admin's own `COUNTRIES` list (`App.tsx:176`) — UAE, Saudi, Qatar, Kuwait, Bahrain, Oman, Egypt — are a region where WhatsApp Business is the default channel small retail actually runs on, more than email or a browser tab kept open all day.

**Where/when:** two exact moments, both already-defined elsewhere in this document, now given a second channel — this isn't a new flow, it's a second door onto flows that already exist. (1) Camera-first intake (idea C): photos sent to a dedicated WhatsApp Business number land in the same staged `ImportBatch` pipeline; a reply confirms price/stock or links to a one-tap page for those two fields. (2) The approval link (idea D): delivered over WhatsApp instead of (or alongside) SMS/email, since it's the channel most likely to actually get opened same-day by a senior approver who never opens the dashboard.

**Why this is a big swing, not a small one:** needs the WhatsApp Business API, media-download handling, and a new webhook route — none of which exist yet. But it isn't a bolt-on gimmick: it's the same staged-import and same step-approval machinery already built, fed through a second adapter — exactly the "adapters, not baked into core" pattern the blueprint already commits to for payments and delivery. Worth a real discussion before committing engineering time, but it's the idea most likely to make someone say "I haven't seen that before" in this category, because it's the direct product of this specific region and this specific always-on-WhatsApp non-technical user, not a generic AI feature ported in from elsewhere.

### G. A queue, not a dashboard: rethink the mobile admin as a single decision feed

**Directly answers Ola's "what would this look like designed as a phone app first" question.** Today's admin is architecturally a desktop dashboard that would need squeezing onto a phone even after adding breakpoints. `DashboardPage` already contains the seed of a better idea without knowing it: its "Action queue" panel (`App.tsx:2272`) is already a flat list of "here's the next thing to decide" — the same mechanism Rescue Watch (idea B) and fulfilment alerts already use.

**Where/when:** replaces the entire admin's mobile presentation, not one screen — triggered purely by viewport, no user action. Below the mobile breakpoint, don't port the 5-page wizard + 6-item sidebar nav; replace it with one continuous, swipeable, single-column feed of decisions — one card per unresolved thing ("this product needs a price," "approve this headline," "3 orders need packing," a Rescue Watch alert) — tapped through top to bottom, not navigated to via tabs. Desktop keeps the full dashboard for the rare person surveying everything at once; the phone gets "what's the next single thing I do."

**Why it's simpler for this user:** it removes navigation as a skill entirely — no sidebar, no remembering which of 5 steps they're on. It's also the most honest reflection of how excess-inventory work actually happens — not a wizard finished once, but an ongoing trickle of "here's a new box, here's three things that need a decision today."

**Why it's a real rebuild:** bottom tab bar (thumb-reachable, matching the WhatsApp/Instagram muscle memory this user already has) for the handful of top-level destinations, single-column stacked forms below ~640px, and the side-by-side "form + live preview" panels in Launch Studio and Preview & Publish (`App.tsx:1514`, `1851`) become an Edit/Preview toggle instead of two panels squeezed to fit. The most expensive idea here, and the one most worth a direct conversation with Ola before scoping.

### H. Turn "AI Catalogue Review" into an anomaly filter, not a review queue

**Where/when:** the moment `AddStockPage`'s import commits (or camera-intake session ends) — the natural next screen a merchant lands on. The blueprint itself already says the right thing (§5: mass-accept only after reviewing a sample and setting a confidence threshold) but the obvious first build of this still-unbuilt screen is a row-by-row review queue — exactly the busywork a 15-minutes-and-a-phone user resents. Flip the default: everything AI is confident about publishes straight through; the screen only ever shows what's anomalous (blurry photo, price wildly off-median, duplicate SKU, missing critical field). `describeProductIssues`/`isCatalogueReady` (`App.tsx:1155–1169`) already compute exactly this signal — the change is UI order and default behavior on an unbuilt screen, not new logic.

### I. A decay-aware merchandising assistant ("Rescue Watch," in-campaign)

Cross-reference: this is the in-campaign half of idea B (Rescue Watch), stated on its own because it's the one AI feature genuinely specific to this product's constraint rather than a variant of "AI writes copy." `Campaign` already has `startsAt`/`endsAt`; `Product` already has live `stock`.

**Where/when:** surfaces inside an already-live campaign, on `DashboardPage`, as the campaign clock and sell-through data change — not a setting to configure, not a step in the wizard. The trigger is state, not a click: *days remaining* crossing a threshold relative to *unsold-unit rate*. It should never appear during setup (nothing to watch yet) and never as a modal interrupting a task — only as another Action Queue card, same mechanism as everything else there: *"14 days left, 6 SKUs haven't sold a unit — bundle as 3-for-1?"*, *"1 unit left across all sizes — feature as 'Last one'?"* Never applies automatically — price is a protected "critical fact" per the blueprint's own AI rules — only ever a suggestion the merchant taps to accept or dismiss.

---

## One structural gap worth flagging even though it's outside the "wizard" framing

`IntegrationPanel` (`App.tsx:1653`) — the Payments/Delivery step of Launch Studio — currently requires the brand to already have "your own team (or whoever you hire) stand up a small bridge service" implementing a fixed HTTP contract. Deliberate and correct legally (no merchant-of-record, no card data ever touching Saleis.live) — but it means the single most consequential wizard step is the one a genuinely non-technical solo retail employee cannot complete alone. **Where/when a fix would appear:** right inside the existing Payments/Delivery tabs of Launch Studio, replacing the current "here's the HTTP contract for your developer" copy with a one-click "Deploy your bridge" button per supported processor (Stripe, Telr, PayTabs — a small pre-built Cloudflare Worker/Vercel function template per processor, deployed into the merchant's *own* free-tier cloud account, never touching Saleis.live's) — same legal shape (client is merchant of record, per blueprint §11), same tab, just removing the "you need to hire a developer" cliff. Worth a real conversation, not a small fix — arguably a bigger barrier to the "15 minutes, non-technical" promise than anything in the wizard steps Ola specifically asked about.

---

## One line on the later idea, as requested

Ola flagged a further-out direction — connecting Saleis.live's inventory data to a "right moment to act" timing signal from her separate TEP research program, not "what's aging" but "when is the correct moment to intervene." Noted as a real future direction and deliberately not designed here, per her own instruction that it's not a now-decision.

---

## Summary table

| Idea | Bucket | Where/when it first appears | Build size |
|---|---|---|---|
| Solo operator skips submit→approve theater | Do soon | Every wizard step, once brand has 1 member | Small |
| Move match/photo-treatment pills behind "Advanced" | Do soon | Add Stock, after file preview | Small |
| Column-mapping table → stacked cards under 640px | Do soon | Mapping screen, pure breakpoint | Small |
| Live "step X of 5, N minutes" readout | Do soon | AdminShell, from brand creation to publish | Small |
| Clone a brand's setup for multi-brand groups | Do soon | Create Brand, only for tenant's 2nd+ brand | Small–medium |
| **PWA per brand, one shared engine** | **Big swing — priority** | Storefront, install nudge after order confirmation / 2nd visit | Small–medium (manifest route + icon gen; SW isolation already free via existing subdomains) |
| AI Stock Rescue — Scan (Tier 1) | Big swing | New card on Add Stock, before any intake tile is chosen | Real, reuses import pipeline |
| AI Stock Rescue — Watch (Tier 2) | Big swing (later) | Dashboard Action Queue, once live API exists | Depends on post-MVP ERP connectors |
| Camera-first stock intake | Big swing | The already-present, inert "Phone/camera" tile | Real, reuses existing AI call |
| Approve via expiring tappable link | Big swing | Fires the moment any step is submitted | Real but contained |
| Instant Pop-up Store | Big swing | Launch Studio's existing access-type control | Small–medium, reuses Campaign |
| WhatsApp as inbound intake + approval channel | Big swing | Same trigger points as camera intake + approval link | Real, new adapter |
| Mobile admin as a decision feed, not a dashboard | Big swing | Entire admin, mobile breakpoint | Real rebuild — needs direct conversation |
| AI Catalogue Review as anomaly filter | Do soon (before it's built) | Right after import commit / camera session ends | Reframe of unbuilt screen |
| Decay-aware assistant ("Rescue Watch," in-campaign) | Big swing | Dashboard Action Queue, once campaign is live | Real build, novel to this niche |
| One-click-deploy payment bridge templates | Flag for discussion | Launch Studio → Payments tab, same place as today | Real build, outside wizard scope |
