import { colors, typography } from "@saleis-live/ui";
import { APPROVED_FONTS, Brand, Campaign, CampaignAccess, DeliveryMethod, HERO_COLOR_PRESETS, HERO_TITLE_SIZE_PX, LOGO_SIZE_PX, Money, Order, Product, contrastTextColor, googleFontCssUrl } from "@saleis-live/domain";
import { ApiError } from "@saleis-live/api-client";
import { SyntheticEvent, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Logo } from "./components/Logo";
import { apiClient, resolveAdminBaseUrl, storeStorefrontUnlockToken } from "./config/apiClient";

/**
 * "Add to bag"/primary-button colour is set once per campaign but read by
 * many leaf components (product card, product detail, bag, checkout,
 * confirmation) that don't otherwise share a campaign prop chain — a
 * context avoids threading it through every intermediate component.
 */
const StoreThemeContext = createContext<{ buyButtonBackground: string; buyButtonText: string }>({
  buyButtonBackground: colors.navy,
  buyButtonText: colors.white,
});
function useStoreTheme() {
  return useContext(StoreThemeContext);
}
function useBuyButtonStyle(): React.CSSProperties {
  const theme = useStoreTheme();
  return { ...styles.buyButton, background: theme.buyButtonBackground, color: theme.buyButtonText };
}

/**
 * Loads a Google Fonts family on demand via a <link> tag — only reached
 * when a merchant picked a hero font outside the 5 self-hosted
 * APPROVED_FONTS (see googleFontCssUrl's own comment on why these aren't
 * bundled). Keyed by family name so switching fonts replaces the link
 * instead of accumulating one per choice ever picked.
 */
function useGoogleFontLoader(family: string | null | undefined): void {
  useEffect(() => {
    if (!family || (APPROVED_FONTS as readonly string[]).includes(family)) return;
    const id = "google-font-link";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = googleFontCssUrl(family);
  }, [family]);
}

/**
 * Fine-tuning hero photo/text position+size and logo size directly on the
 * live storefront (Ola, 2026-08-19: "chcę żeby można było edytować,
 * powiększać, pomniejszać zdjęcie... prawie na żywo" — admin stays the
 * place to upload/pick colours & fonts, the real page is where the exact
 * fit gets corrected). Same drag math as admin's HeroComposer
 * (apps/admin/src/App.tsx) — fraction-of-container offsets, a resize dot
 * for scale — so what's dragged here means the same thing there.
 */
type DragPos = { x: number; y: number; scale?: number };

function useLiveDrag(editMode: boolean, containerRef: React.RefObject<HTMLElement>, initial: DragPos, onCommit: (pos: DragPos) => void) {
  const [pos, setPos] = useState(initial);
  const posRef = useRef(pos);
  posRef.current = pos;
  const initialKey = `${initial.x}:${initial.y}:${initial.scale}`;
  useEffect(() => setPos(initial), [initialKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; startPos: DragPos } | null>(null);
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const beginDrag = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startPos: posRef.current };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    if (drag.mode === "resize") {
      setPos({ ...drag.startPos, scale: clamp((drag.startPos.scale ?? 1) + (dx + dy) / 2, 0.15, 2.5) });
    } else {
      setPos({ x: clamp(drag.startPos.x + dx, 0.05, 0.95), y: clamp(drag.startPos.y + dy, 0.05, 0.95), scale: drag.startPos.scale });
    }
  };
  const onPointerUp = () => {
    if (dragRef.current) onCommit(posRef.current);
    dragRef.current = null;
  };
  return { pos, beginDrag, onPointerMove, onPointerUp };
}

/** Debounces a save-to-server call so rapid drag updates don't fire a PATCH per pixel — only once movement settles. */
function useDebouncedSave<T>(save: (value: T) => void, delayMs = 400): (value: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (value: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => save(value), delayMs);
    },
    [save, delayMs],
  );
}

/** Drag-to-resize the logo directly on the page — simpler than useLiveDrag (no move, no container-relative fraction; just a pixel delta converted to a scale multiplier). */
function useLogoResize(editMode: boolean, initialScale: number, onCommit: (scale: number) => void) {
  const [scale, setScale] = useState(initialScale);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  useEffect(() => setScale(initialScale), [initialScale]);
  const dragRef = useRef<{ startX: number; startY: number; startScale: number } | null>(null);
  const clamp = (v: number) => Math.min(3, Math.max(0.4, v));

  const beginDrag = (e: React.PointerEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, startScale: scaleRef.current };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = e.clientX - drag.startX + (e.clientY - drag.startY);
    setScale(clamp(drag.startScale + delta / 160));
  };
  const onPointerUp = () => {
    if (dragRef.current) onCommit(scaleRef.current);
    dragRef.current = null;
  };
  return { scale, beginDrag, onPointerMove, onPointerUp };
}

/** Desktop vs mobile field set to write drag changes to — matches the .hero-photo-layer/.hero-text-layer media query breakpoint below, so whichever layout you're actually looking at while dragging is the one that gets saved. */
function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= 700;
}

// Flat demo delivery fee — not a real courier rate lookup (no adapter is
// connected, see Launch Studio's honest "Payments/Delivery: Not connected").
const COURIER_FEE_MINOR = 2500;

// Bump this whenever hero-laptop.png/hero-mobile.png are replaced with new
// content under the same filename — otherwise browsers and Render's CDN
// keep serving the old cached bytes at that URL indefinitely.
const HERO_ASSET_VERSION = "3";

function formatMoney(m: Money): string {
  return `${m.currency} ${(m.amountMinor / 100).toFixed(0)}`;
}

function discountPercent(price: Money, salePrice: Money): number {
  if (price.amountMinor === 0 || price.amountMinor === salePrice.amountMinor) return 0;
  return Math.round((1 - salePrice.amountMinor / price.amountMinor) * 100);
}

/** New photos are appended, not prepended (Product Studio, re-imports) — images[0] is not reliably the merchant's chosen main shot, only the isMain flag is. */
function mainImage(product: Product) {
  return product.images.find((i) => i.isMain) ?? product.images[0];
}

/** A stale/deleted photo URL should never show the browser's broken-image glyph — hide the element instead. */
function hideOnError(e: SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.visibility = "hidden";
}

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

type LoadState = "loading" | "not_found" | "locked" | "ready";
type CheckoutInfo = { name: string; phone: string; location: string; deliveryMethod: DeliveryMethod };

/**
 * Google's own crawler runs JavaScript before deciding what to index, so a
 * client-injected robots meta tag genuinely works for search de-indexing —
 * unlike Open Graph link-preview cards (WhatsApp/Slack/LinkedIn/iMessage),
 * whose crawlers only ever read the static, pre-JS HTML document and need
 * server-side templating instead (tracked separately, Share Card phase 1).
 * "public" gets no tag at all (indexable, the existing default); everything
 * else — private/unlisted, invite (no allowlist built yet, so treated the
 * same as private for now), and password — asks not to be indexed, since
 * none of them are meant to be discoverable, only reachable by direct link.
 */
function useNoindexForAccess(access: CampaignAccess | null): void {
  useEffect(() => {
    const existing = document.querySelector('meta[name="robots"]');
    if (access && access !== "public") {
      const tag = existing ?? document.createElement("meta");
      tag.setAttribute("name", "robots");
      tag.setAttribute("content", "noindex, nofollow");
      if (!existing) document.head.appendChild(tag);
    } else if (existing) {
      existing.remove();
    }
    return () => {
      document.querySelector('meta[name="robots"]')?.remove();
    };
  }, [access]);
}

export function App() {
  const [state, setState] = useState<LoadState>("loading");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [access, setAccess] = useState<CampaignAccess | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutInfo, setCheckoutInfo] = useState<CheckoutInfo>({ name: "", phone: "", location: "", deliveryMethod: "courier" });
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const hash = useHashRoute();
  useGoogleFontLoader(campaign?.heroFontPreset);
  const saveLogoScale = useDebouncedSave<number>((scale) => {
    if (!brand) return;
    void apiClient.setBrandLogoScale(brand.id, scale).then(setBrand);
  });
  const logoResize = useLogoResize(editMode && canEdit && !!brand?.logoUrl, brand?.logoScale ?? 1, saveLogoScale);

  const load = useCallback(() => {
    setState("loading");
    apiClient
      .getCurrentStorefrontBrand()
      .then(({ brand: b, previewing: p, canEdit: ce, access: a, locked }) => {
        setBrand(b);
        setPreviewing(p);
        setCanEdit(ce);
        setAccess(a);
        if (locked) {
          setState("locked");
          return null;
        }
        return Promise.all([apiClient.listStorefrontProducts(), apiClient.getCurrentStorefrontCampaign().catch(() => null)]);
      })
      .then((result) => {
        if (!result) return;
        const [p, c] = result;
        setProducts(p);
        setCampaign(c);
        setState("ready");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setState("locked");
          return;
        }
        setState("not_found");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useNoindexForAccess(access);

  if (state === "loading") {
    return <div style={styles.centeredPage}>Loading…</div>;
  }

  if (state === "locked" && brand) {
    return <PasswordGateView brand={brand} onUnlocked={load} />;
  }

  if (state === "not_found" || !brand) {
    return (
      <div style={styles.centeredPage}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>No brand found at this address.</p>
          <p style={{ fontSize: 13, color: "#8A8578" }}>
            Try <code>demo.{window.location.host.replace(/^[^.]*\./, "")}</code>
          </p>
        </div>
      </div>
    );
  }

  // Not gated on the products list (an already-live brand can legitimately
  // have an empty catalogue) — brand.status is the actual publish state,
  // server-enforced in routes/storefront.ts, not inferred client-side.
  const notPublished = brand.status !== "active";
  if (notPublished && !previewing) {
    return (
      <div style={styles.centeredPage}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{brand.name}</p>
          <p style={{ fontSize: 14, color: "#8A8578" }}>This store isn't live yet — check back soon.</p>
        </div>
      </div>
    );
  }

  const addToBag = (productId: string) => setCart((c) => ({ ...c, [productId]: (c[productId] ?? 0) + 1 }));
  const setQuantity = (productId: string, qty: number) =>
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  let body: React.ReactNode;
  if (hash.startsWith("#/product/")) {
    const id = decodeURIComponent(hash.slice("#/product/".length));
    const product = products.find((p) => p.id === id);
    body = product ? <ProductDetailView product={product} onAddToBag={() => addToBag(product.id)} /> : <NotFound />;
  } else if (hash === "#/bag") {
    body = <BagView brand={brand} products={products} cart={cart} setQuantity={setQuantity} />;
  } else if (hash === "#/checkout/delivery") {
    body = <DeliveryView info={checkoutInfo} setInfo={setCheckoutInfo} hasItems={cartCount > 0} />;
  } else if (hash === "#/checkout/payment") {
    body = (
      <PaymentView
        brand={brand}
        products={products}
        cart={cart}
        info={checkoutInfo}
        onPaid={(order) => {
          setLastOrder(order);
          setCart({});
          window.location.hash = `#/order/${order.id}`;
        }}
      />
    );
  } else if (hash.startsWith("#/order/")) {
    body = <ConfirmationView brand={brand} order={lastOrder} />;
  } else {
    body = <HomeView brand={brand} campaign={campaign} products={products} onAddToBag={addToBag} editMode={editMode && canEdit} onCampaignUpdate={setCampaign} />;
  }

  const buyButtonBackground = campaign?.buyButtonColor || colors.navy;
  // An explicit buyButtonTextColor override always wins; otherwise the
  // existing safe auto-contrast fallback.
  const buyButtonText = campaign?.buyButtonTextColor || (campaign?.buyButtonColor ? contrastTextColor(campaign.buyButtonColor) : colors.white);
  const logoEditMode = editMode && canEdit && !!brand?.logoUrl;

  // Set once, page-wide (not just behind the product grid, and not just
  // background) — a colour picked here must look the same on every route
  // (bag, product detail, checkout), never just the home grid. Both
  // properties are inherited CSS properties, so leaving them here and
  // never re-declaring them lower down is what keeps the card and the
  // detail page in sync automatically. Ola, 2026-08-19: "musi się
  // zmieniać wszędzie w sklepie... żeby nie było takiej sytuacji że inny
  // jest w koszyku, inny jak klikamy na produkt" / "jak się kliknie na
  // produkt to musi być ten sam kolor opisu później".
  const pageStyle = {
    ...styles.page,
    ...(campaign?.productAreaBackgroundColor ? { background: campaign.productAreaBackgroundColor } : {}),
    ...(campaign?.bodyTextColor ? { color: campaign.bodyTextColor } : {}),
  };
  const headerStyle = { ...styles.header, ...(campaign?.headerBackgroundColor ? { background: campaign.headerBackgroundColor } : {}) };
  // The "Bag" link and brand placeholder both have their own fixed colours
  // (navy / muted grey) tuned for the header's default white — a dark
  // header colour would otherwise sit right on top of the exact
  // invisible-text bug class fixed elsewhere this session. The saleis.live
  // logo mark itself is NOT recoloured here — it's a fixed brand asset
  // (see Logo.tsx's own comment), same as any platform keeping its own
  // mark's colour regardless of a merchant's chosen theme.
  const headerTextColor = campaign?.headerBackgroundColor ? contrastTextColor(campaign.headerBackgroundColor) : undefined;

  return (
    <StoreThemeContext.Provider value={{ buyButtonBackground, buyButtonText }}>
    <div style={pageStyle}>
      <style>{`
        .storefront-brand-placeholder-short { display: none; }
        @media (max-width: 480px) {
          .storefront-logo svg { height: 32px; width: auto; }
          .storefront-brand-placeholder-full { display: none; }
          .storefront-brand-placeholder-short { display: inline-block; }
        }
      `}</style>
      {notPublished && previewing ? (
        <div style={{ background: "#173B8F", color: "#fff", textAlign: "center", fontSize: 12, fontWeight: 700, padding: "6px 12px" }}>
          PREVIEW — this store is not public yet. Only you can see this.
        </div>
      ) : null}
      <header style={headerStyle}>
        <a href="#/" style={{ ...styles.brandLockup, minWidth: 0 }}>
          {brand.showPlatformLogo !== false ? (
            <span className="storefront-logo" style={{ display: "inline-flex" }}>
              <Logo height={55} />
            </span>
          ) : null}
          {brand.logoUrl ? (
            <span
              style={{ position: "relative", display: "inline-flex", ...(logoEditMode ? { outline: `1px dashed ${colors.navy}`, outlineOffset: 4 } : {}) }}
              onPointerMove={logoEditMode ? logoResize.onPointerMove : undefined}
              onPointerUp={logoEditMode ? logoResize.onPointerUp : undefined}
            >
              <img
                src={apiClient.resolveAssetUrl(brand.logoUrl)}
                alt={brand.name}
                style={{ height: LOGO_SIZE_PX[brand.logoSize ?? "medium"] * logoResize.scale, width: "auto", objectFit: "contain" }}
              />
              {logoEditMode ? (
                <span
                  onPointerDown={logoResize.beginDrag}
                  onClick={(e) => e.preventDefault()}
                  title="Drag to resize the logo"
                  style={{
                    position: "absolute",
                    right: -8,
                    bottom: -8,
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    background: colors.navy,
                    border: `2px solid ${colors.white}`,
                    cursor: "nwse-resize",
                    touchAction: "none",
                  }}
                />
              ) : null}
            </span>
          ) : (
            <>
              <span className="storefront-brand-placeholder-full" style={{ ...styles.brandPlaceholder, ...(headerTextColor ? { color: headerTextColor } : {}) }}>
                Your brand goes here
              </span>
              <span className="storefront-brand-placeholder-short" style={{ ...styles.brandPlaceholder, ...(headerTextColor ? { color: headerTextColor } : {}) }}>
                Your brand
              </span>
            </>
          )}
        </a>
        <a href="#/bag" style={{ ...styles.bagLink, flexShrink: 0, ...(headerTextColor ? { color: headerTextColor } : {}) }}>
          Bag ({cartCount})
        </a>
      </header>

      {body}

      {canEdit ? (
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 50,
            padding: "10px 18px",
            borderRadius: 999,
            border: "none",
            background: editMode ? colors.navy : colors.ink,
            color: colors.white,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          }}
        >
          {editMode ? "✓ Editing — drag the photo, text, or logo" : "✎ Edit mode"}
        </button>
      ) : null}

      <footer style={styles.platformFooter}>
        <a href="https://saleis.live" target="_blank" rel="noreferrer" style={styles.platformFooterLink}>
          Powered by saleis.live
        </a>
        <span style={{ ...styles.platformFooterLink, margin: "0 8px" }}>·</span>
        <a href={`${resolveAdminBaseUrl()}/#/launch-studio`} target="_blank" rel="noreferrer" style={styles.platformFooterLink}>
          Store owner? Edit this store →
        </a>
      </footer>
    </div>
    </StoreThemeContext.Provider>
  );
}

function NotFound() {
  return <p style={{ padding: 32, fontSize: 14 }}>That item isn't available anymore.</p>;
}

/** access: "password" gate — the API already refused products/campaign with a 401, this is just the UI asking for what it needs. onUnlocked re-runs the whole load sequence rather than trying to patch state locally, so it stays correct if anything else about the sale changed since the page opened. */
function PasswordGateView({ brand, onUnlocked }: { brand: Brand; onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const buyButtonStyle = useBuyButtonStyle();

  const submit = async () => {
    if (!password.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const { token } = await apiClient.unlockStorefrontAccess(password);
      storeStorefrontUnlockToken(token);
      onUnlocked();
    } catch {
      setError("That's not the right password.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={styles.centeredPage}>
      <div style={{ textAlign: "center", width: "100%", maxWidth: 320 }}>
        {brand.logoUrl ? (
          <img src={apiClient.resolveAssetUrl(brand.logoUrl)} alt={brand.name} style={{ height: 40, width: "auto", objectFit: "contain", marginBottom: 16 }} />
        ) : (
          <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{brand.name}</p>
        )}
        <p style={{ fontSize: 14, color: "#8A8578", marginBottom: 16 }}>This sale is password-protected.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="Password"
          style={{ ...styles.formInput, textAlign: "center" }}
          autoFocus
        />
        {error ? <p style={{ color: "#B3261E", fontSize: 12, marginTop: 8 }}>{error}</p> : null}
        <button type="button" style={{ ...buyButtonStyle, width: "100%", padding: "14px 16px", fontSize: 14, marginTop: 16, opacity: checking ? 0.6 : 1 }} disabled={checking} onClick={() => void submit()}>
          {checking ? "Checking…" : "Unlock"}
        </button>
      </div>
    </div>
  );
}

function HomeView({
  brand,
  campaign,
  products,
  onAddToBag,
  editMode,
  onCampaignUpdate,
}: {
  brand: Brand;
  campaign: Campaign | null;
  products: Product[];
  onAddToBag: (id: string) => void;
  editMode: boolean;
  onCampaignUpdate: (c: Campaign) => void;
}) {
  const categories = Array.from(new Set(products.map((p) => p.category.value).filter((c): c is string => !!c)));
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const visible = activeCategory ? products.filter((p) => p.category.value === activeCategory) : products;
  const heroFrameRef = useRef<HTMLDivElement>(null);
  // Mobile has its own drag-positioned fields (heroImageOffsetXMobile etc.),
  // but the CSS below applies them with !important, which an inline style
  // set from a live drag can't override — so on-page dragging is
  // desktop-width only for now; mobile fine-tuning stays in admin's Hero
  // layout composer (its Desktop/Mobile toggle isn't bound to your actual
  // viewport, so it doesn't hit this problem).
  const heroDragEnabled = editMode && !isMobileViewport();
  const saveImagePos = useDebouncedSave<DragPos>((pos) => {
    if (!campaign) return;
    void apiClient.updateCampaign(campaign.id, { heroImageOffsetX: pos.x, heroImageOffsetY: pos.y, heroImageScale: pos.scale }).then(onCampaignUpdate);
  });
  const saveTextPos = useDebouncedSave<DragPos>((pos) => {
    if (!campaign) return;
    void apiClient.updateCampaign(campaign.id, { heroTextOffsetX: pos.x, heroTextOffsetY: pos.y }).then(onCampaignUpdate);
  });

  // A merchant who never touched Launch Studio's Store tab gets the
  // platform's own demo hero exactly as before (zero visual change) —
  // this only takes over once they've actually set a headline, custom
  // image, or colour. A custom photo always gets a dark scrim + white
  // text (safe on any photo); the demo's own hero-clean.png keeps its
  // original navy-on-light-negative-space styling, which only works
  // because that specific photo was composed for it.
  const customHeroUrl = campaign?.heroDesktopUrl ? apiClient.resolveAssetUrl(campaign.heroDesktopUrl) : null;
  const customHeroUrlMobile = campaign?.heroMobileUrl ? apiClient.resolveAssetUrl(campaign.heroMobileUrl) : customHeroUrl;
  const colorPreset = campaign?.heroColorPreset ? HERO_COLOR_PRESETS[campaign.heroColorPreset] : null;
  // A free hex colour (colour input, not one of the 4 curated presets)
  // always wins over a preset — the admin UI keeps the two mutually
  // exclusive, but this priority order is what makes that safe even if
  // both were ever set at once.
  const heroBg = campaign?.heroCustomColor || (colorPreset ? colorPreset.background : null);
  const heroFont = campaign?.heroFontPreset || undefined;
  const hasCustomHero = !!(customHeroUrl || heroBg || campaign?.headline);
  const titleSize = HERO_TITLE_SIZE_PX[campaign?.heroTitleSize ?? "medium"];
  const showCta = campaign?.showHeroCta !== false;
  // An explicit heroTextColor override (Ola, 2026-08-19: wants a manual
  // "font colour" field, not only the auto-derived one) always wins;
  // otherwise fall back to the existing safe auto-contrast logic.
  const heroTextColor: string = campaign?.heroTextColor || (customHeroUrl ? "#fff" : campaign?.heroCustomColor ? contrastTextColor(campaign.heroCustomColor) : colorPreset ? colorPreset.text : colors.navy);
  const ctaBackground = campaign?.heroButtonColor || (heroBg ? heroTextColor : null);
  const ctaStyle = {
    ...styles.heroCta,
    ...(ctaBackground
      ? {
          background: ctaBackground,
          // An explicit heroButtonTextColor override always wins. Otherwise
          // a FRESH contrast check against the button's own background —
          // never a reused colour from elsewhere (heroBg, heroTextColor),
          // since those can be any arbitrary hex a merchant picked, not a
          // hand-curated pair. Real bug, 2026-08-19, caught from a live
          // screenshot with a grey hero: a mid-grey hero produced a
          // near-white button with unreadable grey-on-white text.
          color: campaign?.heroButtonTextColor || contrastTextColor(ctaBackground),
        }
      : {}),
  };
  // Drag-positioned layers (Ola, 2026-08-19) — same fraction-of-canvas
  // convention as the admin's HeroComposer and product photo compositing,
  // so what she drags there is exactly what renders here. Desktop values
  // are the base inline style; the <style> block below overrides them for
  // mobile, same mechanism already used for hero-title's font-size.
  const imgPos = { x: campaign?.heroImageOffsetX ?? 0.7, y: campaign?.heroImageOffsetY ?? 0.5, scale: campaign?.heroImageScale ?? 0.9 };
  const imgPosMobile = { x: campaign?.heroImageOffsetXMobile ?? 0.5, y: campaign?.heroImageOffsetYMobile ?? 0.32, scale: campaign?.heroImageScaleMobile ?? 0.85 };
  const textPos = { x: campaign?.heroTextOffsetX ?? 0.28, y: campaign?.heroTextOffsetY ?? 0.5 };
  const textPosMobile = { x: campaign?.heroTextOffsetXMobile ?? 0.5, y: campaign?.heroTextOffsetYMobile ?? 0.72 };
  const imgDrag = useLiveDrag(heroDragEnabled, heroFrameRef, imgPos, saveImagePos);
  const textDrag = useLiveDrag(heroDragEnabled, heroFrameRef, textPos, saveTextPos);
  const liveImgPos = heroDragEnabled ? imgDrag.pos : imgPos;
  const liveTextPos = heroDragEnabled ? textDrag.pos : textPos;

  return (
    <>
      <style>{`
        /* Same container strategy as the marketing site's hero: a generous
           viewport-relative min-height (not the image's own short aspect
           ratio), so the identical 88px/40px type scale always has room to
           flow without colliding with the CTA below it. */
        .hero-frame { min-height: min(70vh, 620px); max-width: 1600px; margin: 0 auto; }
        @media (max-width: 700px) { .hero-frame { min-height: 0; aspect-ratio: 1080 / 1290; max-width: 100%; } }
        /* The tall mobile crop needs a different horizontal window than the wide
           desktop crop, or the diagonal silk sweep drapes straight across the
           headline instead of framing it. */
        @media (max-width: 700px) { .hero-image { object-position: 35% center !important; } }
        @media (max-width: 700px) { .hero-title { font-size: ${titleSize.mobile}px !important; } }
        @media (max-width: 700px) { .hero-copy { padding: 0 6.5% !important; } }
        @media (max-width: 700px) {
          .hero-photo-layer { left: ${imgPosMobile.x * 100}% !important; top: ${imgPosMobile.y * 100}% !important; width: ${imgPosMobile.scale * 100}% !important; height: ${imgPosMobile.scale * 100}% !important; }
          .hero-text-layer { left: ${textPosMobile.x * 100}% !important; top: ${textPosMobile.y * 100}% !important; }
        }
      `}</style>
      <section
        style={{
          background: !hasCustomHero
            ? colors.background
            : // A photo needs a dark backdrop behind its own positioned/scaled
              // space (it's never literally full-bleed), same reasoning as
              // heroTextColor's forced white text there. But a merchant who
              // only typed a headline — no photo, no colour — was silently
              // getting a near-black hero with no way to see why. Real bug,
              // 2026-08-19, caught from a live screenshot: "coś jest nie tak".
              customHeroUrl
              ? heroBg || colors.ink
              : heroBg || colors.background,
        }}
      >
        {!hasCustomHero ? (
          // Untouched hero — the platform's own demo look, byte-identical to
          // before the drag-positioned layout below existed.
          <div className="hero-frame" style={styles.hero}>
            <img src="/images/hero-clean.png" alt="Products staged for a branded sale" className="hero-image" style={styles.heroImage} />
            <div className="hero-copy" style={{ ...styles.heroCopy, zIndex: 2 }}>
              <div style={{ maxWidth: 480 }}>
                <h1 className="hero-title" style={{ ...styles.heroTitle, fontSize: titleSize.desktop }}>
                  Stock in.
                  <br />
                  Sale live.
                </h1>
                <p style={styles.heroSub}>A new AI-powered way to turn your catalogue into a complete branded sale.</p>
                <a href="#products-grid" className="hero-shop-cta" style={ctaStyle}>
                  Shop the sale
                </a>
              </div>
            </div>
          </div>
        ) : (
          // Customised hero — the photo and the headline/copy/CTA block are
          // two independently positioned layers. Position/size are always
          // set from Store design's Hero layout composer (admin); when
          // heroDragEnabled, the SAME layers are also directly draggable
          // right here on the live page (Ola, 2026-08-19: fine-tuning the
          // exact fit belongs on the real page, not a mini preview box).
          <div
            ref={heroFrameRef}
            className="hero-frame"
            style={styles.hero}
            onPointerMove={(e) => {
              imgDrag.onPointerMove(e);
              textDrag.onPointerMove(e);
            }}
            onPointerUp={() => {
              imgDrag.onPointerUp();
              textDrag.onPointerUp();
            }}
            onPointerLeave={() => {
              imgDrag.onPointerUp();
              textDrag.onPointerUp();
            }}
          >
            {customHeroUrl ? (
              <div
                className="hero-photo-layer"
                onPointerDown={heroDragEnabled ? imgDrag.beginDrag("move") : undefined}
                style={{
                  position: "absolute",
                  left: `${liveImgPos.x * 100}%`,
                  top: `${liveImgPos.y * 100}%`,
                  width: `${(liveImgPos.scale ?? imgPos.scale) * 100}%`,
                  height: `${(liveImgPos.scale ?? imgPos.scale) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  ...(heroDragEnabled ? { cursor: "move", touchAction: "none", outline: `1px dashed ${colors.white}`, outlineOffset: 6 } : {}),
                }}
              >
                <picture>
                  <source media="(max-width: 700px)" srcSet={customHeroUrlMobile ?? customHeroUrl} />
                  <img src={customHeroUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4, pointerEvents: "none" }} />
                </picture>
                {heroDragEnabled ? (
                  <span
                    onPointerDown={imgDrag.beginDrag("resize")}
                    title="Drag to resize the photo"
                    style={{ position: "absolute", right: -8, bottom: -8, width: 18, height: 18, borderRadius: 999, background: colors.navy, border: `2px solid ${colors.white}`, cursor: "nwse-resize", touchAction: "none" }}
                  />
                ) : null}
              </div>
            ) : null}
            <div
              className="hero-copy hero-text-layer"
              onPointerDown={heroDragEnabled ? textDrag.beginDrag("move") : undefined}
              style={{
                position: "absolute",
                left: `${liveTextPos.x * 100}%`,
                top: `${liveTextPos.y * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 2,
                maxWidth: "70%",
                padding: "0 16px",
                ...(heroDragEnabled ? { cursor: "move", touchAction: "none", outline: `1px dashed ${heroTextColor}`, outlineOffset: 6 } : {}),
              }}
            >
              <h1 className="hero-title" style={{ ...styles.heroTitle, fontSize: titleSize.desktop, color: heroTextColor, ...(heroFont ? { fontFamily: heroFont } : {}), ...(heroDragEnabled ? { pointerEvents: "none" } : {}) }}>
                {campaign?.headline || (
                  <>
                    Stock in.
                    <br />
                    Sale live.
                  </>
                )}
              </h1>
              {/* Short description is optional (Ola, 2026-08-12) — a merchant who deliberately left it blank shouldn't see the platform's own demo copy fill in instead. */}
              {campaign?.shortDescription ? (
                <p style={{ ...styles.heroSub, color: heroTextColor, opacity: 0.85, ...(heroDragEnabled ? { pointerEvents: "none" } : {}) }}>{campaign.shortDescription}</p>
              ) : null}
              {showCta ? (
                <a href="#products-grid" className="hero-shop-cta" style={{ ...ctaStyle, ...(heroDragEnabled ? { pointerEvents: "none" } : {}) }}>
                  Shop the sale
                </a>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <div style={styles.pillRow}>
        <button type="button" style={{ ...styles.pill, ...(activeCategory === null ? styles.pillActive : {}) }} onClick={() => setActiveCategory(null)}>
          All
        </button>
        {categories.map((c) => (
          <button key={c} type="button" style={{ ...styles.pill, ...(activeCategory === c ? styles.pillActive : {}) }} onClick={() => setActiveCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      <section id="products-grid" style={styles.grid}>
        {visible.map((p) => (
          <ProductCard key={p.id} product={p} onAddToBag={() => onAddToBag(p.id)} />
        ))}
      </section>
      <p style={{ padding: "0 32px 32px", fontSize: 11, color: "#8A8578" }}>Sold and fulfilled by {brand.name}.</p>
    </>
  );
}

function ProductCard({ product, onAddToBag }: { product: Product; onAddToBag: () => void }) {
  const pct = discountPercent(product.price, product.salePrice);
  const soldOut = product.stock <= 0;
  const buyButtonStyle = useBuyButtonStyle();
  return (
    <div style={styles.card}>
      <a href={`#/product/${encodeURIComponent(product.id)}`} style={{ textDecoration: "none", color: "inherit" }}>
        <div style={styles.cardImageWrap}>
          <img src={apiClient.resolveAssetUrl(mainImage(product)?.url ?? "")} alt={mainImage(product)?.alt ?? ""} style={styles.cardImage} onError={hideOnError} />
        </div>
        <p style={styles.cardName}>{product.name.value}</p>
      </a>
      <p style={styles.cardPriceRow}>
        {pct > 0 ? <span style={styles.cardPriceStrike}>{formatMoney(product.price)}</span> : null}
        <span style={styles.cardPrice}>{formatMoney(product.salePrice)}</span>
        {pct > 0 ? <span style={styles.cardPct}>−{pct}%</span> : null}
      </p>
      <button type="button" style={{ ...buyButtonStyle, opacity: soldOut ? 0.4 : 1 }} disabled={soldOut} onClick={onAddToBag}>
        {soldOut ? "Sold out" : "Add to bag"}
      </button>
    </div>
  );
}

function ProductDetailView({ product, onAddToBag }: { product: Product; onAddToBag: () => void }) {
  const [added, setAdded] = useState(false);
  const pct = discountPercent(product.price, product.salePrice);
  const soldOut = product.stock <= 0;
  const availability = soldOut ? "Out of stock" : product.stock <= 5 ? `Only ${product.stock} left` : "In stock";
  const buyButtonStyle = useBuyButtonStyle();

  return (
    <section style={{ maxWidth: 640, margin: "0 auto", padding: "0 32px 56px" }}>
      <a href="#/" style={{ ...styles.backLink, margin: "16px 0 16px" }}>
        ← Back
      </a>
      <div style={{ ...styles.cardImageWrap, aspectRatio: "1/1", marginBottom: 24 }}>
        <img src={apiClient.resolveAssetUrl(mainImage(product)?.url ?? "")} alt={mainImage(product)?.alt ?? ""} style={styles.cardImage} onError={hideOnError} />
      </div>
      {pct > 0 ? <p style={styles.eyebrowSmall}>PRIVATE SALE · −{pct}%</p> : null}
      <h1 style={{ ...styles.h1, fontSize: 30 }}>{product.name.value}</h1>
      <p style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>{formatMoney(product.salePrice)}</p>
      {product.description.value ? <p style={{ fontSize: 14, color: "#5C574C", lineHeight: 1.6, margin: "0 0 24px" }}>{product.description.value}</p> : null}

      <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
        <div>
          <p style={styles.detailLabel}>COLOUR</p>
          <p style={styles.detailValue}>{product.color.value ?? "—"}</p>
        </div>
        <div>
          <p style={styles.detailLabel}>AVAILABILITY</p>
          <p style={styles.detailValue}>{availability}</p>
        </div>
      </div>

      <button
        type="button"
        style={{ ...buyButtonStyle, width: "100%", padding: "14px 16px", fontSize: 14, opacity: soldOut ? 0.4 : 1 }}
        disabled={soldOut}
        onClick={() => {
          onAddToBag();
          setAdded(true);
        }}
      >
        {soldOut ? "Sold out" : added ? "Added ✓" : `Add to bag · ${formatMoney(product.salePrice)}`}
      </button>
    </section>
  );
}

function BagView({
  brand,
  products,
  cart,
  setQuantity,
}: {
  brand: Brand;
  products: Product[];
  cart: Record<string, number>;
  setQuantity: (id: string, qty: number) => void;
}) {
  const items = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
    .filter((i): i is { product: Product; qty: number } => !!i.product);
  const subtotal = items.reduce((sum, i) => sum + i.product.salePrice.amountMinor * i.qty, 0);
  const currency = items[0]?.product.salePrice.currency ?? "AED";
  const buyButtonStyle = useBuyButtonStyle();

  return (
    <section style={{ maxWidth: 640, margin: "0 auto", padding: "0 32px 56px" }}>
      <a href="#/" style={{ ...styles.backLink, margin: "16px 0 0" }}>
        ← Continue shopping
      </a>
      <h1 style={{ ...styles.h1, fontSize: 26, margin: "16px 0 24px" }}>Your bag</h1>

      {items.length === 0 ? (
        <p style={{ fontSize: 14, color: "#5C574C" }}>
          Your bag is empty. <a href="#/">Continue shopping</a>.
        </p>
      ) : (
        <>
          {items.map(({ product, qty }) => (
            <div key={product.id} style={styles.bagRow}>
              <div style={{ ...styles.cardImageWrap, width: 90, aspectRatio: "1/1", flexShrink: 0 }}>
                <img src={apiClient.resolveAssetUrl(mainImage(product)?.url ?? "")} alt="" style={styles.cardImage} onError={hideOnError} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>{product.name.value}</p>
                <p style={{ fontSize: 12, color: "#8A8578", margin: "0 0 8px" }}>
                  {product.color.value ?? ""} · Qty {qty}
                </p>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button type="button" style={styles.qtyButton} onClick={() => setQuantity(product.id, qty - 1)}>
                    −
                  </button>
                  <span style={{ fontSize: 13 }}>{qty}</span>
                  <button type="button" style={styles.qtyButton} onClick={() => setQuantity(product.id, qty + 1)} disabled={qty >= product.stock}>
                    +
                  </button>
                  <button type="button" onClick={() => setQuantity(product.id, 0)} style={styles.removeLink}>
                    Remove
                  </button>
                </div>
              </div>
              <p style={{ fontSize: 14, fontWeight: 700 }}>{formatMoney({ amountMinor: product.salePrice.amountMinor * qty, currency: product.salePrice.currency })}</p>
            </div>
          ))}

          <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 16, paddingTop: 16, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Subtotal</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{formatMoney({ amountMinor: subtotal, currency })}</span>
          </div>
          <p style={{ fontSize: 12, color: "#8A8578", margin: "4px 0 24px" }}>Delivery calculated next</p>

          <div style={styles.noticeCard}>
            <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>Sold and fulfilled by {brand.name}.</p>
            {brand.returnPolicy ? <p style={{ fontSize: 12, color: "#5C574C", margin: 0 }}>{brand.returnPolicy}</p> : null}
          </div>

          <a href="#/checkout/delivery" style={{ ...buyButtonStyle, display: "block", textAlign: "center", textDecoration: "none", marginTop: 24, padding: "14px 16px" }}>
            Continue to checkout
          </a>
        </>
      )}
    </section>
  );
}

function DeliveryView({ info, setInfo, hasItems }: { info: CheckoutInfo; setInfo: (i: CheckoutInfo) => void; hasItems: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const canContinue = hasItems && !!info.name.trim() && !!info.location.trim();
  const buyButtonStyle = useBuyButtonStyle();

  return (
    <section style={{ maxWidth: 480, margin: "0 auto", padding: "0 32px 56px" }}>
      <a href="#/bag" style={{ ...styles.backLink, margin: "16px 0 0" }}>
        ← Back to bag
      </a>
      <h1 style={{ ...styles.h1, fontSize: 26, margin: "16px 0 24px" }}>Delivery or pickup</h1>

      {!hasItems ? (
        <p style={{ fontSize: 14 }}>
          Your bag is empty. <a href="#/">Continue shopping</a>.
        </p>
      ) : (
        <>
          <label style={styles.formLabel}>Full name</label>
          <input style={styles.formInput} value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} placeholder="Ola W." />

          <label style={styles.formLabel}>Phone</label>
          <input style={styles.formInput} value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} placeholder="+971 50 000 0000" />

          <label style={styles.formLabel}>Address</label>
          <input style={styles.formInput} value={info.location} onChange={(e) => setInfo({ ...info, location: e.target.value })} placeholder="The Greens, Dubai" />

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              type="button"
              style={{ ...styles.deliveryOption, ...(info.deliveryMethod === "courier" ? styles.deliveryOptionActive : {}) }}
              onClick={() => setInfo({ ...info, deliveryMethod: "courier" })}
            >
              Courier delivery · {formatMoney({ amountMinor: COURIER_FEE_MINOR, currency: "AED" })}
            </button>
            <button
              type="button"
              style={{ ...styles.deliveryOption, ...(info.deliveryMethod === "pickup" ? styles.deliveryOptionActive : {}) }}
              onClick={() => setInfo({ ...info, deliveryMethod: "pickup" })}
            >
              Store pickup · Free
            </button>
          </div>

          {error ? <p style={{ color: "#B3261E", fontSize: 12, marginTop: 12 }}>{error}</p> : null}

          <button
            type="button"
            style={{ ...buyButtonStyle, width: "100%", padding: "14px 16px", fontSize: 14, marginTop: 24, opacity: canContinue ? 1 : 0.4 }}
            disabled={!canContinue}
            onClick={() => {
              if (!canContinue) {
                setError("Name and address are required.");
                return;
              }
              window.location.hash = "#/checkout/payment";
            }}
          >
            Continue to payment
          </button>
        </>
      )}
    </section>
  );
}

function PaymentView({
  brand,
  products,
  cart,
  info,
  onPaid,
}: {
  brand: Brand;
  products: Product[];
  cart: Record<string, number>;
  info: CheckoutInfo;
  onPaid: (order: Order) => void;
}) {
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buyButtonStyle = useBuyButtonStyle();

  const items = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
    .filter((i): i is { product: Product; qty: number } => !!i.product);
  const itemsTotal = items.reduce((sum, i) => sum + i.product.salePrice.amountMinor * i.qty, 0);
  const deliveryFee = info.deliveryMethod === "courier" ? COURIER_FEE_MINOR : 0;
  const total = itemsTotal + deliveryFee;
  const currency = items[0]?.product.salePrice.currency ?? "AED";

  const onPay = async () => {
    setPlacing(true);
    setError(null);
    try {
      const { order, checkoutUrl } = await apiClient.startCheckout({
        brandId: brand.id,
        items: items.map((i) => ({ productId: i.product.id, quantity: i.qty })),
        customerName: info.name,
        customerPhone: info.phone,
        customerLocation: info.location,
        deliveryMethod: info.deliveryMethod,
        // The connected processor redirects here after payment. It knows the order id (we sent
        // it in the checkout-creation call), so it can append its own ref/status if it wants to;
        // we don't assume a shape here since that's between the brand and their own integration.
        returnUrl: `${window.location.origin}${window.location.pathname}#/`,
      });
      if (checkoutUrl) {
        // Brand has a real payment integration connected — hand off to it. It's responsible
        // for redirecting the buyer back; we don't poll or assume success here.
        window.location.href = checkoutUrl;
        return;
      }
      const paid = await apiClient.confirmTestPayment(order.id);
      onPaid(paid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the order.");
      setPlacing(false);
    }
  };

  if (items.length === 0) {
    return (
      <section style={{ maxWidth: 480, margin: "0 auto", padding: "0 32px 56px" }}>
        <p style={{ fontSize: 14 }}>
          Your bag is empty. <a href="#/">Continue shopping</a>.
        </p>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: 480, margin: "0 auto", padding: "0 32px 56px" }}>
      <a href="#/checkout/delivery" style={{ ...styles.backLink, margin: "16px 0 0" }}>
        ← Back
      </a>
      <h1 style={{ ...styles.h1, fontSize: 26, margin: "16px 0 16px" }}>Payment</h1>
      <div style={styles.noticeCard}>
        <p style={{ fontSize: 13, fontWeight: 700, color: colors.navy, margin: 0 }}>
          TEST MODE — no real payment method is collected here. Clicking "Pay" below simply confirms the order for testing.
        </p>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Order summary</h2>
        {items.map(({ product, qty }) => (
          <div key={product.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0" }}>
            <span>
              {product.name.value} × {qty}
            </span>
            <span>{formatMoney({ amountMinor: product.salePrice.amountMinor * qty, currency: product.salePrice.currency })}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderTop: `1px solid ${colors.border}`, marginTop: 8 }}>
          <span>Delivery</span>
          <span>{deliveryFee > 0 ? formatMoney({ amountMinor: deliveryFee, currency }) : "Free"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, padding: "10px 0", borderTop: `1px solid ${colors.border}` }}>
          <span>Total</span>
          <span>{formatMoney({ amountMinor: total, currency })}</span>
        </div>
      </div>

      {error ? <p style={{ color: "#B3261E", fontSize: 12, marginTop: 12 }}>{error}</p> : null}

      <button
        type="button"
        style={{ ...buyButtonStyle, width: "100%", padding: "14px 16px", fontSize: 14, marginTop: 24, opacity: placing ? 0.5 : 1 }}
        disabled={placing}
        onClick={onPay}
      >
        {placing ? "Placing…" : `Pay ${formatMoney({ amountMinor: total, currency })} (TEST)`}
      </button>
    </section>
  );
}

function ConfirmationView({ brand, order }: { brand: Brand; order: Order | null }) {
  const buyButtonStyle = useBuyButtonStyle();
  if (!order) {
    return (
      <section style={{ maxWidth: 480, margin: "0 auto", padding: "56px 32px", textAlign: "center" }}>
        <p style={{ fontSize: 14 }}>
          No recent order to show. <a href="#/">Continue shopping</a>.
        </p>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: 480, margin: "0 auto", padding: "56px 32px", textAlign: "center" }}>
      <div style={styles.confirmCheck}>✓</div>
      <h1 style={{ ...styles.h1, fontSize: 26, margin: "16px 0 8px" }}>Order confirmed</h1>
      <p style={{ fontSize: 13, color: colors.navy, fontWeight: 700, margin: "0 0 24px" }}>#{order.id}</p>

      <div style={{ ...styles.noticeCard, textAlign: "left" }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>
          {order.deliveryMethod === "courier" ? `Delivery to ${order.customerLocation}` : `Pickup from ${brand.name}`}
        </p>
        <p style={{ fontSize: 13, color: colors.navy, fontWeight: 700, margin: "0 0 12px" }}>Preparing</p>
        <p style={{ fontSize: 11, color: "#8A8578", margin: "0 0 2px" }}>Estimated {order.deliveryMethod === "courier" ? "delivery" : "pickup"}</p>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>2-4 business days</p>
      </div>

      <a href="#/" style={{ ...buyButtonStyle, display: "block", textAlign: "center", textDecoration: "none", marginTop: 24, padding: "14px 16px" }}>
        Continue shopping
      </a>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: colors.background, fontFamily: typography.fontFamily.ui, color: colors.ink },
  centeredPage: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: colors.background,
    fontFamily: typography.fontFamily.ui,
    color: colors.ink,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 32px",
    borderBottom: `1px solid ${colors.border}`,
    background: colors.surface,
  },
  brandLockup: { display: "flex", alignItems: "center", gap: 10, textDecoration: "none" },
  brandPlaceholder: {
    fontSize: 11,
    fontWeight: 600,
    color: "#8A8578",
    border: "1px dashed #C9C2B2",
    borderRadius: 999,
    padding: "3px 10px",
  },
  bagLink: { fontSize: 13, fontWeight: 700, color: colors.navy, textDecoration: "none" },
  platformFooter: { padding: "20px 32px 28px", textAlign: "center" as const },
  platformFooterLink: { fontSize: 11, color: colors.muted, textDecoration: "none" },
  backLink: { display: "inline-block", fontSize: 13, fontWeight: 600, color: "#5C574C", textDecoration: "none", margin: "24px 0 0" },

  // No background here — the outer <section> (App.tsx's HomeView) is the
  // single source of truth for hero colour (default ivory, or the
  // merchant's chosen colour preset/custom photo). A hardcoded background
  // here used to sit on top of it and mask any colour that wasn't ivory —
  // real bug, 2026-08-18: a merchant picked "Navy" and it never showed.
  hero: { position: "relative", overflow: "hidden" },
  heroImage: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "68% center" },
  heroCopy: { position: "absolute", inset: 0, zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 4.5%" },
  heroTitle: { fontFamily: "'Cormorant Garamond', 'Instrument Serif', Georgia, serif", fontWeight: 500, fontSize: 88, color: colors.navy, margin: "0 0 22px", lineHeight: 1.02, maxWidth: 560 },
  heroSub: { fontSize: 18, color: colors.muted, margin: 0, maxWidth: 420, lineHeight: 1.55 },
  eyebrowSmall: { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: colors.ultramarine, margin: "0 0 8px" },
  h1: { fontFamily: typography.fontFamily.display, fontSize: 44, margin: "0 0 8px", lineHeight: 1.1 },
  heroCta: {
    display: "inline-block",
    marginTop: 28,
    padding: "12px 24px",
    borderRadius: 8,
    background: colors.navy,
    color: colors.white,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
  },

  pillRow: { display: "flex", gap: 8, padding: "24px 32px 0", flexWrap: "wrap" },
  pill: { padding: "8px 16px", borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.white, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  pillActive: { background: colors.ink, color: colors.white, border: `1px solid ${colors.ink}` },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 24,
    padding: "24px 32px",
  },
  card: { display: "flex", flexDirection: "column", gap: 8 },
  cardImageWrap: { aspectRatio: "4/5", borderRadius: 12, overflow: "hidden", background: colors.surface },
  cardImage: { width: "100%", height: "100%", objectFit: "cover" },
  cardName: { fontSize: 14, fontWeight: 500, margin: 0 },
  cardPriceRow: { display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 14 },
  cardPriceStrike: { textDecoration: "line-through", color: "#8A8578" },
  cardPrice: { fontWeight: 700 },
  cardPct: { color: colors.ultramarine, fontWeight: 600, fontSize: 12 },
  buyButton: {
    marginTop: 4,
    padding: "10px 16px",
    borderRadius: 999,
    border: "none",
    background: colors.navy,
    color: colors.white,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  detailLabel: { fontSize: 11, fontWeight: 700, color: "#8A8578", letterSpacing: 0.4, margin: "0 0 4px" },
  detailValue: { fontSize: 14, fontWeight: 600, margin: 0 },

  bagRow: { display: "flex", gap: 16, padding: "16px 0", borderBottom: `1px solid ${colors.border}` },
  qtyButton: { width: 26, height: 26, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.white, cursor: "pointer", fontSize: 14 },
  removeLink: { background: "none", border: "none", color: "#8A8578", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 },

  noticeCard: { background: colors.surface, borderRadius: 12, padding: 16 },

  formLabel: { display: "block", fontSize: 11, fontWeight: 700, color: "#8A8578", letterSpacing: 0.4, marginTop: 16, marginBottom: 6 },
  formInput: { width: "100%", boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "12px 14px", fontSize: 14, fontFamily: "inherit" },
  deliveryOption: { textAlign: "left", padding: "14px 16px", borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.white, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  deliveryOptionActive: { border: `2px solid ${colors.navy}`, color: colors.navy, background: colors.background },

  confirmCheck: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: colors.navy,
    color: colors.white,
    fontSize: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto",
  },
};
