import { colors, typography } from "@saleis-live/ui";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./components/Logo";
import { ADMIN_URL, DEMO_STORE_URL } from "./config/links";

/**
 * Marketing-site-only display face (Ola's explicit scope: large statement
 * type on this page only). Admin/storefront keep the brand token's
 * Instrument Serif — this is a local override, not a token change.
 */
const DISPLAY_FONT = "'Cormorant Garamond', 'Instrument Serif', Georgia, serif";

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Demo", href: "#demo" },
  { label: "Developers", href: "#/developers" },
];

const MINI_STEPS = [
  { title: "Upload any stock", body: "Excel, CSV or photos." },
  { title: "AI prepares catalogue", body: "Clean, enrich, translate." },
  { title: "Launch your sale", body: "Storefront, payments, delivery." },
];

const STEPS = [
  { title: "Upload your stock", body: "Add inventory via Excel, CSV or product photos." },
  { title: "AI prepares your catalogue", body: "saleis.live maps data, matches product images, cleans and enriches content and flags anything that needs review." },
  { title: "Launch your branded sale", body: "Publish a complete branded storefront with products, payments, orders and delivery." },
];

const INTEGRATIONS = ["API-ready", "Multi-brand", "PWA", "Payments", "Delivery", "Data import"];

const TRUST_BAR = [
  { title: "Turn unsold stock", body: "Bring inventory sitting in storage or spreadsheets back to life and start selling it — without discounting your brand." },
  { title: "Secure, private & infrastructure-free", body: "Your data stays yours. We handle the technology, security and uptime — so you can focus on growth." },
  { title: "Built for scale — from day one", body: "Whether it's 100 or 100,000 products, saleis.live is built to scale with your business." },
  { title: "Your brand. Fully owned.", body: "Your storefront, your domain, your rules. We power it, you own it — 100%." },
];

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/** Restrained scroll-reveal — one fade+rise per section, matches the quiet motion on linear.app/vercel.com rather than a flashy library. */
function Reveal({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        ...style,
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 0.7s ease, transform 0.7s ease",
      }}
    >
      {children}
    </div>
  );
}

export function App() {
  const scrolled = useScrolled();
  const hash = useHashRoute();
  const onDevelopers = hash.startsWith("#/developers");

  return (
    <div style={styles.page}>
      <style>{`
        .marketing-nav-links { display: flex; gap: 32px; }
        @media (max-width: 780px) { .marketing-nav-links { display: none; } }
        @media (max-width: 480px) {
          .brand svg { height: 38px !important; width: auto !important; }
          .marketing-nav-cta { font-size: 12px !important; padding: 8px 14px !important; }
        }

        .hero-desktop { display: block; }
        .hero-mobile { display: none; }
        @media (max-width: 780px) {
          .hero-desktop { display: none; }
          .hero-mobile { display: block; }
        }

        .marketing-mini-steps { display: flex; flex-wrap: wrap; gap: 8px 28px; }

        .marketing-flow-row { display: flex; align-items: center; justify-content: center; gap: 28px; flex-wrap: wrap; }
        @media (max-width: 620px) { .marketing-flow-row { flex-direction: column; gap: 6px; } }
        .marketing-flow-arrow-mobile { display: none; }
        @media (max-width: 620px) { .marketing-flow-arrow-mobile { display: block; } .marketing-flow-arrow-desktop { display: none; } }

        .marketing-step-row { display: flex; align-items: center; gap: 40px; padding: 40px 0; border-top: 1px solid ${colors.border}; }
        .marketing-step-row:last-child { border-bottom: 1px solid ${colors.border}; }
        @media (max-width: 620px) { .marketing-step-row { gap: 20px; padding: 28px 0; } }

        .marketing-action-grid { display: grid; grid-template-columns: 1.55fr 1fr; gap: 40px; align-items: start; }
        @media (max-width: 900px) { .marketing-action-grid { grid-template-columns: 1fr; } }

        .marketing-spec-row { display: flex; border-top: 1px solid ${colors.border}; border-bottom: 1px solid ${colors.border}; }
        .marketing-spec-row > div { flex: 1; border-left: 1px solid ${colors.border}; }
        .marketing-spec-row > div:first-child { border-left: none; }
        @media (max-width: 780px) {
          .marketing-spec-row { display: grid; grid-template-columns: 1fr 1fr; border-left: 1px solid ${colors.border}; }
          .marketing-spec-row > div { border-left: none; border-right: 1px solid ${colors.border}; border-bottom: 1px solid ${colors.border}; }
          .marketing-spec-row > div:nth-child(2n) { border-right: none; }
        }

        .marketing-why-row { display: flex; gap: 56px; align-items: baseline; padding: 44px 0; border-top: 1px solid ${colors.border}; }
        .marketing-why-row:last-child { border-bottom: 1px solid ${colors.border}; }
        @media (max-width: 700px) { .marketing-why-row { flex-direction: column; gap: 10px; padding: 32px 0; } }

        .marketing-dev-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 780px) { .marketing-dev-grid { grid-template-columns: 1fr; } }
      `}</style>

      <header style={{ ...styles.header, ...(scrolled ? styles.headerScrolled : {}) }}>
        <div style={styles.headerInner}>
          <a href="#/" className="brand" style={styles.brand}>
            <Logo height={55} />
          </a>
          <nav className="marketing-nav-links">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} style={styles.navLink}>
                {link.label}
              </a>
            ))}
          </nav>
          <a href={ADMIN_URL} className="marketing-nav-cta" style={styles.navCta}>
            Get saleis.live
          </a>
        </div>
      </header>

      {onDevelopers ? <DevelopersPage /> : <HomePage />}

      <footer style={styles.footer}>
        <span style={{ fontSize: 12, color: colors.muted }}>© {new Date().getFullYear()} saleis.live</span>
      </footer>
    </div>
  );
}

function HomePage() {
  return (
    <>
      {/* 01 — Hero: full-bleed product photography as the actual background, not a boxed side-by-side image. */}
      <section id="product" className="hero-desktop" style={styles.heroDesktop}>
        <img src="/images/hero-product.png" alt="Products staged for a branded sale generated by saleis.live" style={styles.heroDesktopImage} />
        <div style={styles.heroDesktopContent}>
          <p style={styles.eyebrow}>PRODUCT</p>
          <h1 style={styles.h1}>
            Stock in.
            <br />
            Sale live.
          </h1>
          <p style={styles.heroSub}>The AI-powered platform that turns unsold stock into a complete branded sale — in days, not months.</p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 36 }}>
            <a href={ADMIN_URL} style={styles.primaryButton}>
              Get saleis.live
            </a>
            <a href="#demo" style={styles.secondaryButton}>
              View demo
            </a>
          </div>
          <div className="marketing-mini-steps" style={{ marginTop: 48 }}>
            {MINI_STEPS.map((s) => (
              <span key={s.title} style={styles.miniStepItem}>
                <strong style={{ color: colors.navy }}>{s.title}</strong> — {s.body}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="hero-mobile" style={styles.heroMobile}>
        <img src="/images/hero-product.png" alt="Products staged for a branded sale generated by saleis.live" style={styles.heroMobileImage} />
        <div style={styles.heroMobileContent}>
          <p style={styles.eyebrow}>PRODUCT</p>
          <h1 style={{ ...styles.h1, fontSize: 48 }}>
            Stock in.
            <br />
            Sale live.
          </h1>
          <p style={styles.heroSub}>The AI-powered platform that turns unsold stock into a complete branded sale — in days, not months.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
            <a href={ADMIN_URL} style={styles.primaryButton}>
              Get saleis.live
            </a>
            <a href="#demo" style={styles.secondaryButton}>
              View demo
            </a>
          </div>
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 10 }}>
            {MINI_STEPS.map((s) => (
              <span key={s.title} style={styles.miniStepItem}>
                <strong style={{ color: colors.navy }}>{s.title}</strong> — {s.body}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 02 — Product idea: one flow statement, not three cards. */}
      <Reveal>
        <section id="flow" style={styles.flowSection}>
          <div className="marketing-flow-row">
            <span style={styles.flowWord}>Stock</span>
            <span className="marketing-flow-arrow-desktop" style={styles.flowArrow}>
              →
            </span>
            <span className="marketing-flow-arrow-mobile" style={styles.flowArrow}>
              ↓
            </span>
            <span style={styles.flowWord}>AI</span>
            <span className="marketing-flow-arrow-desktop" style={styles.flowArrow}>
              →
            </span>
            <span className="marketing-flow-arrow-mobile" style={styles.flowArrow}>
              ↓
            </span>
            <span style={styles.flowWord}>Branded sale</span>
          </div>
          <p style={styles.flowSub}>Unsold inventory becomes a live, branded storefront — saleis.live handles everything in between.</p>
        </section>
      </Reveal>

      {/* 03 — How it works: sequence, not a feature grid. */}
      <Reveal>
        <section id="how-it-works" style={styles.howSection}>
          <h2 style={styles.h2}>How saleis.live works</h2>
          <p style={styles.sectionSub}>Three simple steps from stock to sale.</p>
          <div style={{ marginTop: 56 }}>
            {STEPS.map((step, i) => (
              <div key={step.title} className="marketing-step-row">
                <span style={styles.ghostNumeral}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 style={styles.stepRowTitle}>{step.title}</h3>
                  <p style={styles.stepRowBody}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* 04 — See saleis.live in action: asymmetric hierarchy, product as the hero of the section. */}
      <Reveal>
        <section id="demo" style={styles.actionSection}>
          <h2 style={styles.h2}>See saleis.live in action</h2>
          <p style={styles.sectionSub}>Real screenshots of the actual product — your own store, on your own subdomain, is what you get after "Get saleis.live".</p>
          <div className="marketing-action-grid" style={{ marginTop: 56 }}>
            <a href={ADMIN_URL} style={styles.actionPrimary}>
              <div style={styles.actionPrimaryImageFrame}>
                <img src="/images/admin-demo.jpg" alt="The real saleis.live admin panel" style={styles.actionImage} />
              </div>
              <div style={styles.actionCaption}>
                <p style={styles.actionEyebrow}>FOR SELLERS</p>
                <p style={styles.actionText}>Upload stock, edit with AI, and launch a branded sale — from one admin panel.</p>
                <span style={styles.actionLink}>View admin demo →</span>
              </div>
            </a>
            <a href={DEMO_STORE_URL} style={styles.actionSecondary}>
              <div style={styles.actionSecondaryImageFrame}>
                <img src="/images/demo-store.jpg" alt="The real saleis.live demo storefront" style={styles.actionImage} />
              </div>
              <div style={styles.actionCaption}>
                <p style={styles.actionEyebrow}>FOR BUYERS</p>
                <p style={styles.actionText}>A branded storefront your customers browse, bag and check out from.</p>
                <span style={styles.actionLink}>View demo store →</span>
              </div>
            </a>
          </div>
        </section>
      </Reveal>

      {/* 05 — Built to integrate: technical register, spec-sheet row instead of icon tiles. */}
      <Reveal>
        <section id="integrate" style={styles.integrateSection}>
          <div style={styles.integrateHead}>
            <h2 style={{ ...styles.h2, textAlign: "left" }}>Built to integrate</h2>
            <p style={styles.integrateBody}>saleis.live is designed as a platform, not a closed storefront. Connect product data, payments, fulfilment and existing commerce infrastructure.</p>
            <a href="#/developers" style={styles.integrateLink}>
              Developers →
            </a>
          </div>
          <div className="marketing-spec-row" style={{ marginTop: 40 }}>
            {INTEGRATIONS.map((label, i) => (
              <div key={label} style={styles.specItem}>
                <span style={styles.specIndex}>{String(i + 1).padStart(2, "0")}</span>
                <span style={styles.specLabel}>{label}</span>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* 07 — Final CTA: statement + button + space, nothing else. */}
      <section id="cta" style={styles.ctaBand}>
        <h2 style={styles.ctaTitle}>Your sale. Your brand. Our technology.</h2>
        <p style={styles.ctaSub}>Join brands and retailers using saleis.live to unlock value from unsold stock.</p>
        <a href={ADMIN_URL} style={styles.ctaButton}>
          Get saleis.live
        </a>
      </section>

      {/* 06 — Why saleis.live: editorial statements, typography and space do the work. */}
      <Reveal>
        <section id="why" style={styles.whySection}>
          {TRUST_BAR.map((t) => (
            <div key={t.title} className="marketing-why-row">
              <h3 style={styles.whyTitle}>{t.title}</h3>
              <p style={styles.whyBody}>{t.body}</p>
            </div>
          ))}
        </section>
      </Reveal>
    </>
  );
}

function DevelopersPage() {
  return (
    <section style={{ ...styles.section, paddingTop: 56 }}>
      <a href="#/" style={styles.backLink}>
        ← Back
      </a>
      <h1 style={{ ...styles.h2, textAlign: "left", marginTop: 16 }}>Built as a platform, not a one-off shop build.</h1>
      <div className="marketing-dev-grid" style={{ marginTop: 40 }}>
        <div style={styles.devCard}>
          <div style={styles.devCardIcon}>
            <ShieldIcon />
          </div>
          <h3 style={styles.devCardTitle}>Architecture</h3>
          <p style={styles.devCardBody}>
            A typed monorepo: shared domain types, a design-token package, an Express API, and separate React apps for the admin panel and each brand's storefront. Every business record carries a tenant and brand
            id — isolation is enforced at the data layer, not just the UI.
          </p>
        </div>
        <div style={styles.devCard}>
          <div style={styles.devCardIcon}>
            <CodeIcon />
          </div>
          <h3 style={styles.devCardTitle}>Payments &amp; delivery — bring your own integration</h3>
          <p style={styles.devCardBody}>
            Saleis.live never holds buyer funds and never sees a card number. Connect your own payment processor or courier by standing up a small bridge service against one fixed HTTP contract — no
            processor-specific SDK, no OAuth flow to build. Full request/response shapes are in Launch Studio's Payments and Delivery tabs once your store exists, and summarized below.
          </p>
          <pre style={styles.codeBlock}>
{`We call your endpoint:
POST  {endpointUrl}/checkout   { orderId, amountMinor, currency, returnUrl } → { checkoutUrl, ref }
GET   {endpointUrl}/status/{ref}                                            → { status }
POST  {endpointUrl}/refund     { ref, amountMinor, currency }               → { status }

Your service calls us back:
POST  https://saleis.live/api/webhooks/payment/{brandId}
      Header: X-Webhook-Secret: {your generated secret}
      Body:   { orderId, status, ref }`}
          </pre>
        </div>
        <div style={styles.devCard}>
          <div style={styles.devCardIcon}>
            <MonitorIcon />
          </div>
          <h3 style={styles.devCardTitle}>Installable admin panel</h3>
          <p style={styles.devCardBody}>
            A per-brand installable app for the merchant side (your own name, icon, and colors on your home screen) is in progress. The buyer-facing storefront stays link-based by design — no install friction
            for someone who just wants to check out.
          </p>
        </div>
        <div style={styles.devCard}>
          <div style={styles.devCardIcon}>
            <CloudIcon />
          </div>
          <h3 style={styles.devCardTitle}>Deployment</h3>
          <p style={styles.devCardBody}>
            One Node API service, and one static site per app (admin, storefront, marketing), each independently deployable. Every brand resolves via its own subdomain, wildcard-routed to the same storefront
            build.
          </p>
        </div>
      </div>
    </section>
  );
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6L2 12l6 6M16 6l6 6-6 6" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 18a4.5 4.5 0 0 1-1-8.9A5 5 0 0 1 15.5 8a4 4 0 0 1 1.5 7.9M7 18h10" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: typography.fontFamily.ui, color: colors.ink, background: colors.background },

  header: { position: "sticky", top: 0, zIndex: 10, background: "transparent", transition: "background 0.2s, box-shadow 0.2s" },
  headerScrolled: { background: colors.surface, boxShadow: "0 1px 0 rgba(0,0,0,0.06)" },
  headerInner: { maxWidth: 1320, margin: "0 auto", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand: { display: "flex", alignItems: "center", textDecoration: "none" },
  navLink: { fontSize: 14, fontWeight: 600, color: colors.ink, textDecoration: "none" },
  navCta: { fontSize: 13, fontWeight: 700, color: colors.white, background: colors.navy, padding: "10px 18px", borderRadius: 999, textDecoration: "none", whiteSpace: "nowrap" },
  backLink: { display: "inline-block", fontSize: 13, fontWeight: 600, color: colors.muted, textDecoration: "none" },

  // Hero — desktop: full-bleed image, text overlaid on the image's own negative space.
  heroDesktop: { position: "relative", minHeight: "min(84vh, 760px)", overflow: "hidden" },
  heroDesktopImage: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "68% center" },
  heroDesktopContent: { position: "relative", height: "100%", maxWidth: 1320, margin: "0 auto", padding: "0 32px", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "min(84vh, 760px)" },

  // Hero — mobile: image as a top band, content flows below (not a scaled desktop poster).
  heroMobileImage: { width: "100%", display: "block", aspectRatio: "1774 / 1180", objectFit: "cover", objectPosition: "70% center" },
  heroMobileContent: { padding: "36px 24px 48px" },

  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: colors.navy, margin: "0 0 16px" },
  h1: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 88, lineHeight: 1.02, margin: "0 0 22px", color: colors.navy, maxWidth: 560 },
  h2: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 44, lineHeight: 1.1, margin: 0, textAlign: "center", color: colors.navy },
  heroSub: { fontSize: 18, color: colors.muted, margin: 0, maxWidth: 420, lineHeight: 1.55 },
  primaryButton: { display: "inline-block", background: colors.navy, color: colors.white, fontSize: 14, fontWeight: 700, padding: "15px 28px", borderRadius: 999, textDecoration: "none" },
  secondaryButton: { display: "inline-block", background: "transparent", color: colors.ink, fontSize: 14, fontWeight: 700, padding: "15px 28px", borderRadius: 999, textDecoration: "none", border: `1px solid ${colors.border}` },

  miniStepItem: { fontSize: 13, color: colors.muted, lineHeight: 1.5 },

  section: { padding: "140px 32px", maxWidth: 1320, margin: "0 auto" },
  sectionSub: { fontSize: 16, color: colors.muted, textAlign: "center", maxWidth: 560, margin: "16px auto 0" },

  // 02 — product idea flow statement
  flowSection: { padding: "120px 32px", maxWidth: 1320, margin: "0 auto", textAlign: "center" },
  flowWord: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 56, color: colors.navy },
  flowArrow: { fontFamily: DISPLAY_FONT, fontSize: 34, color: colors.stone },
  flowSub: { fontSize: 15, color: colors.muted, marginTop: 24, maxWidth: 480, marginLeft: "auto", marginRight: "auto" },

  // 03 — how it works
  howSection: { padding: "140px 32px", maxWidth: 900, margin: "0 auto" },
  ghostNumeral: { fontFamily: DISPLAY_FONT, fontSize: 108, lineHeight: 1, color: "rgba(23,59,143,0.14)", flexShrink: 0, width: 150 },
  stepRowTitle: { fontSize: 22, fontWeight: 600, margin: "0 0 8px", color: colors.navy },
  stepRowBody: { fontSize: 15, color: colors.muted, lineHeight: 1.6, margin: 0, maxWidth: 460 },

  // 04 — see saleis.live in action
  actionSection: { padding: "140px 32px", maxWidth: 1320, margin: "0 auto" },
  actionPrimary: { display: "block", textDecoration: "none", color: colors.ink },
  actionPrimaryImageFrame: { position: "relative", aspectRatio: "1280 / 780", borderRadius: 4, overflow: "hidden", background: colors.paper, boxShadow: "0 30px 70px rgba(17,17,17,0.12)" },
  actionSecondary: { display: "block", textDecoration: "none", color: colors.ink, marginTop: 8 },
  actionSecondaryImageFrame: { position: "relative", aspectRatio: "1280 / 780", borderRadius: 4, overflow: "hidden", background: colors.paper },
  actionImage: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" },
  actionCaption: { paddingTop: 22, maxWidth: 460 },
  actionEyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: colors.navy, margin: "0 0 8px" },
  actionText: { fontSize: 15, color: colors.muted, lineHeight: 1.6, margin: "0 0 10px" },
  actionLink: { fontSize: 14, fontWeight: 700, color: colors.navy },

  // 05 — built to integrate
  integrateSection: { padding: "140px 32px", maxWidth: 1320, margin: "0 auto" },
  integrateHead: { maxWidth: 560 },
  integrateBody: { fontSize: 15, color: colors.muted, lineHeight: 1.6, margin: "16px 0 14px" },
  integrateLink: { fontSize: 14, fontWeight: 700, color: colors.navy, textDecoration: "none" },
  specItem: { padding: "22px 20px", display: "flex", flexDirection: "column", gap: 10 },
  specIndex: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: colors.muted },
  specLabel: { fontSize: 14, fontWeight: 600, color: colors.ink },

  devCard: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 32 },
  devCardIcon: { width: 52, height: 52, borderRadius: 12, background: colors.bluepale, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  devCardTitle: { fontFamily: DISPLAY_FONT, fontSize: 26, color: colors.navy, fontWeight: 500, margin: "0 0 14px" },
  devCardBody: { fontSize: 14, color: colors.muted, lineHeight: 1.7, margin: 0 },
  codeBlock: { fontSize: 11, lineHeight: 1.6, background: colors.background, borderRadius: 8, padding: 14, marginTop: 14, overflowX: "auto", whiteSpace: "pre" },

  // 07 — final CTA
  ctaBand: { background: colors.navy, padding: "160px 32px", textAlign: "center" },
  ctaTitle: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 48, color: colors.white, margin: "0 0 16px" },
  ctaSub: { fontSize: 16, color: colors.stone, margin: "0 0 32px", maxWidth: 480, marginLeft: "auto", marginRight: "auto" },
  ctaButton: { display: "inline-block", background: colors.white, color: colors.ink, fontSize: 14, fontWeight: 700, padding: "16px 32px", borderRadius: 999, textDecoration: "none" },

  // 06 — why saleis.live (editorial statements)
  whySection: { padding: "40px 32px 140px", maxWidth: 1000, margin: "0 auto" },
  whyTitle: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 32, color: colors.navy, margin: 0, flex: "0 0 320px" },
  whyBody: { fontSize: 15, color: colors.muted, lineHeight: 1.7, margin: 0, maxWidth: 480 },

  footer: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "32px", background: "#F7F2ED" },
};
