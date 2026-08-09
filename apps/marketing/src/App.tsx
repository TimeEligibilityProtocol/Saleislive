import { colors, typography } from "@saleis-live/ui";
import { Fragment, useEffect, useState } from "react";
import { Logo } from "./components/Logo";
import { ADMIN_URL, DEMO_STORE_URL } from "./config/links";

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Demo", href: "#demo" },
  { label: "Developers", href: "#developers" },
];

const MINI_STEPS = [
  { icon: <UploadIcon />, title: "Upload any stock", body: "Excel, CSV or photos. We handle the rest." },
  { icon: <SparkleIcon />, title: "AI prepares catalogue", body: "Clean, enrich, translate and organise." },
  { icon: <StoreIcon />, title: "Launch your sale", body: "Branded storefront, payments and delivery." },
];

const STEPS = [
  { title: "Upload your stock", body: "Add inventory via Excel, CSV or photos. One upload is all it takes." },
  { title: "AI prepares your catalogue", body: "Our AI cleans data, checks photos and enriches content — you review and approve, nothing publishes unverified." },
  { title: "Launch your branded sale", body: "Go live with your own storefront on your own subdomain — payments and delivery connect through your own providers." },
];

const TRUST_BAR = [
  { icon: <ShieldIcon />, title: "Isolated by design", body: "Every record carries a tenant and brand id — enforced at the data layer, not just the UI." },
  { icon: <GlobeIcon />, title: "Multi-currency, multi-language", body: "Set both up front in Brand Setup — storefront copy and layout follow from day one." },
  { icon: <CodeIcon />, title: "Bring your own integration", body: "Connect your own payment processor and courier through one open HTTP contract — see Developers." },
  { icon: <SupportIcon />, title: "Honest by default", body: "Nothing shows as connected, published, or charged unless it actually is." },
];

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

export function App() {
  const scrolled = useScrolled();

  return (
    <div style={styles.page}>
      <style>{`
        html { scroll-behavior: smooth; }
        .marketing-nav-links { display: flex; gap: 28px; }
        @media (max-width: 780px) { .marketing-nav-links { display: none; } }
        .marketing-hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
        @media (max-width: 900px) { .marketing-hero-grid { grid-template-columns: 1fr; } }
        .marketing-mini-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        @media (max-width: 620px) { .marketing-mini-steps { grid-template-columns: 1fr; } }
        .marketing-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; align-items: start; }
        @media (max-width: 780px) { .marketing-steps { grid-template-columns: 1fr; } }
        .marketing-step-arrow { display: flex; align-items: center; justify-content: center; padding-top: 20px; }
        @media (max-width: 780px) { .marketing-step-arrow { display: none; } }
        .marketing-demo-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 780px) { .marketing-demo-cards { grid-template-columns: 1fr; } }
        .marketing-trust-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; }
        @media (max-width: 900px) { .marketing-trust-bar { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px) { .marketing-trust-bar { grid-template-columns: 1fr; } }
      `}</style>

      <header style={{ ...styles.header, ...(scrolled ? styles.headerScrolled : {}) }}>
        <div style={styles.headerInner}>
          <a href="#product" style={styles.brand}>
            <Logo height={26} />
          </a>
          <nav className="marketing-nav-links">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} style={styles.navLink}>
                {link.label}
              </a>
            ))}
          </nav>
          <a href={ADMIN_URL} style={styles.navCta}>
            Get saleis.live
          </a>
        </div>
      </header>

      <section id="product" style={styles.hero}>
        <div className="marketing-hero-grid" style={styles.heroInner}>
          <div>
            <p style={styles.eyebrow}>PRODUCT</p>
            <h1 style={styles.h1}>Stock in. Sale live.</h1>
            <p style={styles.heroSub}>The AI-powered platform that turns unsold stock into a complete branded sale — in days, not months.</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
              <a href={ADMIN_URL} style={styles.primaryButton}>
                Get saleis.live
              </a>
              <a href="#demo" style={styles.secondaryButton}>
                View demo
              </a>
            </div>
            <div className="marketing-mini-steps" style={{ marginTop: 40 }}>
              {MINI_STEPS.map((s) => (
                <div key={s.title}>
                  <div style={styles.miniStepIcon}>{s.icon}</div>
                  <p style={styles.miniStepTitle}>{s.title}</p>
                  <p style={styles.miniStepBody}>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
          <div style={styles.heroImageFrame}>
            <img src="/images/hero-product.png" alt="Products staged for a branded sale generated by saleis.live" style={styles.heroImage} />
          </div>
        </div>
      </section>

      <section id="how-it-works" style={{ ...styles.section, background: colors.paper }}>
        <h2 style={styles.h2Center}>How saleis.live works</h2>
        <p style={styles.sectionSub}>Three simple steps from stock to sale.</p>
        <div className="marketing-steps" style={{ marginTop: 48 }}>
          {STEPS.map((step, i) => (
            <Fragment key={step.title}>
              <div>
                <div style={styles.stepNumber}>{i + 1}</div>
                <h3 style={styles.stepTitle}>{step.title}</h3>
                <p style={styles.stepBody}>{step.body}</p>
              </div>
              {i < STEPS.length - 1 ? (
                <div className="marketing-step-arrow">
                  <ArrowIcon />
                </div>
              ) : null}
            </Fragment>
          ))}
        </div>
      </section>

      <section id="demo" style={styles.section}>
        <h2 style={styles.h2Center}>See saleis.live in action</h2>
        <p style={styles.sectionSub}>
          The demo below isn't saleis.live itself — it's proof of what saleis.live generates. Your own store, on your own subdomain, is what you get after "Get saleis.live".
        </p>
        <div className="marketing-demo-cards" style={{ marginTop: 32 }}>
          <a href={DEMO_STORE_URL} style={styles.demoCardDark}>
            <p style={styles.demoCardEyebrowDark}>DEMO STORE</p>
            <p style={styles.demoCardBodyDark}>Explore a live example of a branded sale powered by saleis.live — browse, bag, checkout.</p>
            <span style={styles.demoCardLinkDark}>View demo store →</span>
          </a>
          <a href={ADMIN_URL} style={styles.demoCardLight}>
            <p style={styles.demoCardEyebrowLight}>ADMIN DEMO</p>
            <p style={styles.demoCardBodyLight}>See how easy it is to upload stock, edit products with AI, and launch your sale.</p>
            <span style={styles.demoCardLinkLight}>View admin demo →</span>
          </a>
        </div>
      </section>

      <section id="developers" style={{ ...styles.section, background: colors.paper }}>
        <h2 style={styles.h2Center}>Built as a platform, not a one-off shop build.</h2>
        <div style={styles.devGrid}>
          <div style={styles.devCard}>
            <h3 style={styles.devCardTitle}>Architecture</h3>
            <p style={styles.devCardBody}>
              A typed monorepo: shared domain types, a design-token package, an Express API, and separate React apps for the admin panel and each brand's storefront. Every business record carries a tenant and brand
              id — isolation is enforced at the data layer, not just the UI.
            </p>
          </div>
          <div style={styles.devCard}>
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
            <h3 style={styles.devCardTitle}>Installable admin panel</h3>
            <p style={styles.devCardBody}>
              A per-brand installable app for the merchant side (your own name, icon, and colors on your home screen) is in progress. The buyer-facing storefront stays link-based by design — no install
              friction for someone who just wants to check out.
            </p>
          </div>
          <div style={styles.devCard}>
            <h3 style={styles.devCardTitle}>Deployment</h3>
            <p style={styles.devCardBody}>One Node API service, and one static site per app (admin, storefront, marketing), each independently deployable. Every brand resolves via its own subdomain, wildcard-routed to the same storefront build.</p>
          </div>
        </div>
      </section>

      <section style={styles.ctaBand}>
        <h2 style={styles.ctaTitle}>Your sale. Your brand. Our technology.</h2>
        <p style={styles.ctaSub}>Join brands and retailers using saleis.live to unlock value from unsold stock.</p>
        <a href={ADMIN_URL} style={styles.ctaButton}>
          Get saleis.live
        </a>
      </section>

      <section style={{ ...styles.section, paddingTop: 56, paddingBottom: 56 }}>
        <div className="marketing-trust-bar">
          {TRUST_BAR.map((t) => (
            <div key={t.title}>
              <div style={styles.trustIcon}>{t.icon}</div>
              <p style={styles.trustTitle}>{t.title}</p>
              <p style={styles.trustBody}>{t.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer style={styles.footer}>
        <Logo height={16} />
        <span style={{ fontSize: 12, color: colors.muted }}>© {new Date().getFullYear()} saleis.live</span>
      </footer>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9l1-5h14l1 5" />
      <path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
      <path d="M5 9v10h14V9" />
      <path d="M10 19v-6h4v6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none" stroke={colors.stone} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 8h24M20 2l6 6-6 6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6L2 12l6 6M16 6l6 6-6 6" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 12a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.5-2.4 1a7.4 7.4 0 0 0-1.7-1L14.8 3H9.2l-.4 2.4a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.6a7.4 7.4 0 0 0 0 2l-2 1.6 2 3.5 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.4h5.6l.4-2.4a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.5-2-1.6c.07-.33.1-.66.1-1z" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: typography.fontFamily.ui, color: colors.ink, background: colors.background },

  header: { position: "sticky", top: 0, zIndex: 10, background: "transparent", transition: "background 0.2s, box-shadow 0.2s" },
  headerScrolled: { background: colors.surface, boxShadow: "0 1px 0 rgba(0,0,0,0.06)" },
  headerInner: { maxWidth: 1200, margin: "0 auto", padding: "18px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand: { display: "flex", alignItems: "center", textDecoration: "none" },
  navLink: { fontSize: 14, fontWeight: 600, color: colors.ink, textDecoration: "none" },
  navCta: { fontSize: 13, fontWeight: 700, color: colors.white, background: colors.navy, padding: "10px 18px", borderRadius: 999, textDecoration: "none" },

  hero: { padding: "64px 32px 96px" },
  heroInner: { maxWidth: 1200, margin: "0 auto" },
  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1, color: colors.navy, margin: "0 0 12px" },
  h1: { fontFamily: typography.fontFamily.display, fontSize: 56, lineHeight: 1.05, margin: "0 0 20px" },
  h2Center: { fontFamily: typography.fontFamily.display, fontSize: 34, lineHeight: 1.2, margin: 0, textAlign: "center" },
  heroSub: { fontSize: 18, color: colors.muted, margin: 0, maxWidth: 440, lineHeight: 1.5 },
  primaryButton: { display: "inline-block", background: colors.navy, color: colors.white, fontSize: 14, fontWeight: 700, padding: "14px 26px", borderRadius: 999, textDecoration: "none" },
  secondaryButton: { display: "inline-block", background: "transparent", color: colors.ink, fontSize: 14, fontWeight: 700, padding: "14px 26px", borderRadius: 999, textDecoration: "none", border: `1px solid ${colors.border}` },
  heroImageFrame: { position: "relative", aspectRatio: "1774 / 887", borderRadius: 16, overflow: "hidden", background: colors.paper },
  heroImage: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center bottom" },

  miniStepIcon: { width: 36, height: 36, borderRadius: 9, background: colors.bluepale, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  miniStepTitle: { fontSize: 13, fontWeight: 700, margin: "0 0 4px" },
  miniStepBody: { fontSize: 12, color: colors.muted, margin: 0, lineHeight: 1.5 },

  section: { padding: "80px 32px", maxWidth: 1200, margin: "0 auto" },
  sectionSub: { fontSize: 15, color: colors.muted, textAlign: "center", maxWidth: 620, margin: "12px auto 0" },

  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: colors.pale,
    color: colors.ink,
    fontWeight: 700,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
  },
  stepTitle: { fontSize: 16, fontWeight: 700, margin: "0 0 8px", textAlign: "center" },
  stepBody: { fontSize: 13, color: colors.muted, lineHeight: 1.6, margin: 0, textAlign: "center" },

  demoCardDark: { display: "block", background: colors.ink, borderRadius: 16, padding: 32, textDecoration: "none" },
  demoCardEyebrowDark: { fontSize: 12, fontWeight: 700, letterSpacing: 1, color: colors.stone, margin: "0 0 12px" },
  demoCardBodyDark: { fontSize: 14, color: colors.stone, lineHeight: 1.6, margin: "0 0 20px" },
  demoCardLinkDark: { fontSize: 14, fontWeight: 700, color: colors.white },

  demoCardLight: { display: "block", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 32, textDecoration: "none", color: colors.ink },
  demoCardEyebrowLight: { fontSize: 12, fontWeight: 700, letterSpacing: 1, color: colors.navy, margin: "0 0 12px" },
  demoCardBodyLight: { fontSize: 14, color: colors.muted, lineHeight: 1.6, margin: "0 0 20px" },
  demoCardLinkLight: { fontSize: 14, fontWeight: 700, color: colors.navy },

  devGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 40 },
  devCard: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 28 },
  devCardTitle: { fontSize: 16, fontWeight: 700, margin: "0 0 10px" },
  devCardBody: { fontSize: 13, color: colors.muted, lineHeight: 1.6, margin: 0 },
  codeBlock: { fontSize: 11, lineHeight: 1.6, background: colors.background, borderRadius: 8, padding: 14, marginTop: 14, overflowX: "auto", whiteSpace: "pre" },

  ctaBand: { background: colors.ink, padding: "72px 32px", textAlign: "center" },
  ctaTitle: { fontFamily: typography.fontFamily.display, fontSize: 32, color: colors.white, margin: "0 0 12px" },
  ctaSub: { fontSize: 15, color: colors.stone, margin: "0 0 28px", maxWidth: 480, marginLeft: "auto", marginRight: "auto" },
  ctaButton: { display: "inline-block", background: colors.white, color: colors.ink, fontSize: 14, fontWeight: 700, padding: "14px 28px", borderRadius: 999, textDecoration: "none" },

  trustIcon: { marginBottom: 10 },
  trustTitle: { fontSize: 14, fontWeight: 700, margin: "0 0 6px" },
  trustBody: { fontSize: 12, color: colors.muted, lineHeight: 1.5, margin: 0 },

  footer: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "32px", borderTop: `1px solid ${colors.border}` },
};
