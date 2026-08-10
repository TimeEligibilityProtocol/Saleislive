import { colors, typography } from "@saleis-live/ui";
import { Fragment, useEffect, useRef, useState } from "react";
import { Logo } from "./components/Logo";
import { ADMIN_URL, DEMO_STORE_URL } from "./config/links";

/**
 * Marketing-site-only display face (Ola's explicit scope: large statement
 * type on this page only). Admin/storefront keep the brand token's
 * Instrument Serif — this is a local override, not a token change.
 */
const DISPLAY_FONT = "'Cormorant Garamond', 'Instrument Serif', Georgia, serif";

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Demo", href: "#demo" },
  { label: "Developers", href: "#/developers" },
];

const STEPS = [
  { icon: "file", title: "Upload your stock", body: "Add inventory via Excel, CSV or product photos." },
  { icon: "sparkle", title: "AI prepares your catalogue", body: "saleis.live maps data, matches product images, cleans and enriches content and flags anything that needs review." },
  { icon: "store", title: "Launch your branded sale", body: "Publish a complete branded storefront with products, payments, orders and delivery." },
];

const INTEGRATIONS = [
  { icon: "code", label: "API-ready" },
  { icon: "layers", label: "Multi-brand" },
  { icon: "phone", label: "PWA" },
  { icon: "card", label: "Payments" },
  { icon: "truck", label: "Delivery" },
  { icon: "db", label: "Data import" },
];

const CATEGORY_TICKER = ["yourbrand", "clothes", "beauty", "shoes", "jewelry", "home", "cosmetics", "accessories"].map((slug) => `www.${slug}saleis.live`);

const SYSTEMS = ["SAP", "Oracle", "Microsoft Dynamics", "Odoo", "NetSuite", "Shopify", "Magento", "WooCommerce", "WMS", "ERP", "PIM", "POS"];

const TRUST_BAR = [
  { icon: "sparkle", title: "Turn unsold stock", body: "Bring inventory sitting in storage or spreadsheets back to life and start selling it — without discounting your brand." },
  { icon: "shield", title: "Secure, private & infrastructure-free", body: "Your data stays yours. We handle the technology, security and uptime — so you can focus on growth." },
  { icon: "code", title: "Built for scale — from day one", body: "Whether it's 100 or 100,000 products, saleis.live is built to scale with your business." },
  { icon: "star", title: "Your brand. Fully owned.", body: "Your storefront, your domain, your rules. We power it, you own it — 100%." },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    setMobileMenuOpen(false);
  }, [onDevelopers]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onHashChange = () => setMobileMenuOpen(false);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [mobileMenuOpen]);

  return (
    <div style={styles.page}>
      <style>{`
        .marketing-nav-links { display: flex; gap: 32px; }
        @media (max-width: 780px) { .marketing-nav-links { display: none; } }
        @media (max-width: 480px) {
          .brand svg { height: 38px !important; width: auto !important; }
          .marketing-nav-cta { font-size: 12px !important; padding: 8px 14px !important; }
        }

        .marketing-menu-btn { display: none; background: none; border: none; padding: 8px; cursor: pointer; }
        @media (max-width: 780px) { .marketing-menu-btn { display: flex; } }
        .marketing-mobile-menu { display: none; }
        @media (max-width: 780px) {
          .marketing-mobile-menu { display: flex; flex-direction: column; padding: 8px 32px 20px; gap: 4px; background: ${colors.paper}; border-bottom: 1px solid ${colors.border}; }
          .marketing-mobile-menu a { padding: 12px 0; font-size: 15px; font-weight: 600; color: ${colors.ink}; text-decoration: none; border-bottom: 1px solid ${colors.border}; }
          .marketing-mobile-menu a:last-child { border-bottom: none; }
        }

        .hero-desktop { display: block; }
        .hero-mobile { display: none; }
        @media (max-width: 780px) {
          .hero-desktop { display: none; }
          .hero-mobile { display: block; }
        }

        .marketing-steps-row { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr); gap: 20px; align-items: start; }
        @media (max-width: 900px) { .marketing-steps-row { grid-template-columns: minmax(0,1fr); } .marketing-steps-row h3, .marketing-steps-row p { text-align: center; } }
        .marketing-step-arrow { display: flex; align-items: center; justify-content: center; padding-top: 28px; }
        @media (max-width: 900px) { .marketing-step-arrow { display: none; } }

        .marketing-action-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 48px; align-items: start; }
        @media (max-width: 900px) { .marketing-action-grid { grid-template-columns: minmax(0,1fr); gap: 32px; } .marketing-action-grid a { text-align: center; } }

        .marketing-spec-row { display: flex; border-top: 1px solid ${colors.border}; border-bottom: 1px solid ${colors.border}; }
        .marketing-spec-row > div { flex: 1; border-left: 1px solid ${colors.border}; }
        .marketing-spec-row > div:first-child { border-left: none; }
        @media (max-width: 780px) {
          .marketing-spec-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); border-left: 1px solid ${colors.border}; }
          .marketing-spec-row > div { border-left: none; border-right: 1px solid ${colors.border}; border-bottom: 1px solid ${colors.border}; }
          .marketing-spec-row > div:nth-child(2n) { border-right: none; }
        }

        .marketing-why-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 32px; margin-top: 56px; text-align: center; justify-items: center; }
        .marketing-why-grid > div { display: flex; flex-direction: column; align-items: center; }
        @media (max-width: 900px) { .marketing-why-grid { grid-template-columns: minmax(0,1fr) minmax(0,1fr); } }
        @media (max-width: 560px) { .marketing-why-grid { grid-template-columns: minmax(0,1fr); } }

        .marketing-dev-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; }
        @media (max-width: 780px) { .marketing-dev-grid { grid-template-columns: minmax(0, 1fr); } }


        @keyframes iconGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(23,59,143,0); }
          50% { box-shadow: 0 0 18px 3px rgba(23,59,143,0.35); }
        }
        .icon-glow { animation: iconGlow 3.2s ease-in-out infinite; }
        .icon-glow:nth-of-type(2) { animation-delay: 0.4s; }
        .icon-glow:nth-of-type(3) { animation-delay: 0.8s; }
        @media (prefers-reduced-motion: reduce) { .icon-glow { animation: none; } }

        .systems-flow-pill { flex-wrap: wrap; row-gap: 10px; }
        @media (max-width: 620px) { .systems-flow-pill { padding: 12px 18px !important; gap: 10px !important; } }
        @media (max-width: 780px) { .systems-bridge-section { display: none; } }
        @keyframes flowArrowTravel { 0%, 100% { transform: translateX(0); opacity: 0.55; } 50% { transform: translateX(6px); opacity: 1; } }
        .systems-flow-arrow { display: inline-block; color: ${colors.navy}; font-size: 22px; animation: flowArrowTravel 1.2s ease-in-out infinite; }
        .systems-flow-arrow:nth-of-type(2) { animation-delay: 0.15s; }
        .systems-flow-arrow:nth-of-type(4) { animation-delay: 0.3s; }
        .systems-flow-arrow:nth-of-type(6) { animation-delay: 0.45s; }
        .systems-payoff { position: relative; padding-bottom: 14px; }
        .systems-payoff::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 64px;
          height: 3px;
          background: ${colors.navy};
          border-radius: 999px;
          transform: translateX(-50%);
          animation: payoffUnderline 2.2s ease-in-out infinite;
        }
        @keyframes payoffUnderline { 0%, 100% { width: 64px; opacity: 0.5; } 50% { width: 140px; opacity: 1; } }

        @media (prefers-reduced-motion: reduce) { .systems-flow-arrow, .systems-payoff::after { animation: none; } }

        @keyframes heroEnter { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
        .hero-enter { animation: heroEnter 1s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes kenburns { from { transform: scale(1); } to { transform: scale(1.06); } }
        .hero-kenburns { animation: kenburns 18s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .hero-enter, .hero-kenburns { animation: none; } }

        .marketing-ticker-track { display: flex; width: max-content; animation: ticker 26s linear infinite; }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .marketing-ticker-track { animation: none; } }

        a { transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease; }
        .marketing-nav-links a { position: relative; }
        .marketing-nav-links a::after { content: ""; position: absolute; left: 0; right: 100%; bottom: -4px; height: 1px; background: ${colors.navy}; transition: right 0.25s ease; }
        .marketing-nav-links a:hover::after { right: 0; }
        .marketing-nav-links a:hover { color: ${colors.navy}; }

        .marketing-primary-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(23,59,143,0.28); }
        .marketing-secondary-btn:hover { border-color: ${colors.navy}; color: ${colors.navy}; background: ${colors.bluepale}; }
        .marketing-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,0.25); }

        .marketing-arrow-link { display: inline-flex; align-items: center; gap: 6px; }
        .marketing-arrow-link .arrow-glyph { display: inline-block; transition: transform 0.25s ease; }
        .marketing-arrow-link:hover .arrow-glyph { transform: translateX(5px); }

        .marketing-action-visual { overflow: hidden; }
        .marketing-action-visual img { transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        .marketing-action-visual:hover img { transform: scale(1.045); }
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
          <button
            type="button"
            className="marketing-menu-btn"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth="2" strokeLinecap="round">
              {mobileMenuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        {mobileMenuOpen ? (
          <nav className="marketing-mobile-menu">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
            <a href={ADMIN_URL}>Get saleis.live</a>
          </nav>
        ) : null}
      </header>

      {onDevelopers ? <DevelopersPage /> : <HomePage />}

      <footer style={styles.footer}>
        <span style={{ fontSize: 12, color: colors.muted }}>© {new Date().getFullYear()} saleis.live</span>
        <span style={{ fontSize: 12, color: colors.muted }}>·</span>
        <span style={{ fontSize: 12, color: colors.muted }}>Powered by Quanthio</span>
      </footer>
    </div>
  );
}

function HomePage() {
  return (
    <>
      {/* 01 — Hero: full-bleed product photography as the actual background, not a boxed side-by-side image. */}
      <section id="product" className="hero-desktop" style={styles.heroDesktop}>
        <img className="hero-kenburns" src="/images/hero-product.png" alt="Products staged for a branded sale generated by saleis.live" style={styles.heroDesktopImage} />
        <div style={styles.heroDesktopContent}>
          <div className="hero-enter" style={{ maxWidth: 480 }}>
            <h1 style={styles.h1}>
              Stock in.
              <br />
              Sale live.
            </h1>
            <p style={styles.heroSub}>The AI-powered platform that turns unsold stock into a complete branded sale — in days, not months.</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 36 }}>
              <a href={ADMIN_URL} className="marketing-primary-btn" style={styles.primaryButton}>
                Get saleis.live
              </a>
              <a href="#demo" className="marketing-secondary-btn" style={styles.secondaryButton}>
                View demo
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="hero-mobile" style={styles.heroMobile}>
        <img className="hero-kenburns" src="/images/hero-mobile.png" alt="Products staged for a branded sale generated by saleis.live" style={styles.heroMobileImage} />
        <div className="hero-enter" style={styles.heroMobileContent}>
          <h1 style={{ ...styles.h1, fontSize: 30, margin: "0 0 12px", maxWidth: 150 }}>
            Stock in.
            <br />
            Sale live.
          </h1>
          <p style={{ ...styles.heroSub, fontSize: 14.5, lineHeight: 1.45, margin: 0, maxWidth: 195 }}>The AI-powered platform that turns unsold stock into a complete branded sale — in days, not months.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20, maxWidth: 175 }}>
            <a href={ADMIN_URL} className="marketing-primary-btn" style={{ ...styles.primaryButton, textAlign: "center" }}>
              Get saleis.live
            </a>
            <a href="#demo" className="marketing-secondary-btn" style={{ ...styles.secondaryButton, textAlign: "center" }}>
              View demo
            </a>
          </div>
        </div>
      </section>

      {/* Category ticker — honest: retail categories saleis.live serves, not fabricated client logos. */}
      <div style={styles.tickerBand}>
        <div className="marketing-ticker-track">
          {[...CATEGORY_TICKER, ...CATEGORY_TICKER].map((cat, i) => (
            <span key={cat + i} style={styles.tickerItem}>
              {cat}
              <span style={styles.tickerDot}>•</span>
            </span>
          ))}
        </div>
      </div>

      {/* 02 — How it works: horizontal 3-column sequence, matching the approved board. */}
      <Reveal>
        <section id="how-it-works" style={{ ...styles.howSection, background: colors.paper }}>
          <h2 style={styles.h2}>
            How saleis.live works
          </h2>
          <p style={styles.sectionSub}>Three simple steps from stock to sale.</p>
          <div className="marketing-steps-row" style={{ marginTop: 56 }}>
            {STEPS.map((step, i) => (
              <Fragment key={step.title}>
                <div>
                  <div style={styles.stepColHead}>
                    <span style={styles.stepNumberBadge}>{String(i + 1).padStart(2, "0")}</span>
                    <div className="icon-glow" style={styles.stepIconBox}>
                      <StepIcon name={step.icon} size={28} />
                    </div>
                  </div>
                  <h3 style={styles.stepRowTitle}>{step.title}</h3>
                  <p style={styles.stepRowBody}>{step.body}</p>
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
      </Reveal>

      {/* 03 — See saleis.live in action: equal-weight panels inside one bordered frame, so the section reads as one unit. */}
      <Reveal>
        <section id="demo" style={styles.actionSection}>
          <h2 style={styles.h2}>
            See saleis.live in action
          </h2>
          <p style={styles.sectionSub}>Real screenshots of the actual product — your own store, on your own subdomain, is what you get after "Get saleis.live".</p>
          <div style={styles.actionFrame}>
            <div className="marketing-action-grid" style={{ marginTop: 0 }}>
              <a href={ADMIN_URL} style={styles.actionPanel}>
                <span style={styles.actionBadge}>FOR SELLERS</span>
                <div className="marketing-action-visual" style={styles.actionImageFrame}>
                  <img src="/images/admin-demo.jpg" alt="The real saleis.live admin panel" style={styles.actionImage} />
                </div>
                <div style={styles.actionCaption}>
                  <p style={styles.actionText}>Upload stock, edit with AI, and launch a branded sale — from one admin panel.</p>
                  <span className="marketing-arrow-link" style={styles.actionLink}>View admin demo <span className="arrow-glyph">→</span></span>
                </div>
              </a>
              <a href={DEMO_STORE_URL} style={styles.actionPanel}>
                <span style={styles.actionBadge}>FOR BUYERS</span>
                <div className="marketing-action-visual" style={styles.actionImageFrame}>
                  <img src="/images/demo-store.jpg" alt="The real saleis.live demo storefront" style={styles.actionImage} />
                </div>
                <div style={styles.actionCaption}>
                  <p style={styles.actionText}>A branded storefront your customers browse, bag and check out from.</p>
                  <span className="marketing-arrow-link" style={styles.actionLink}>View demo store <span className="arrow-glyph">→</span></span>
                </div>
              </a>
            </div>
          </div>
        </section>
      </Reveal>

      {/* Systems bridge: any existing system already speaks Excel — that's the on-ramp into saleis.live. */}
      <Reveal>
        <section className="systems-bridge-section" style={{ ...styles.section, textAlign: "center" }}>
          <div style={styles.systemsCard}>
            <div className="systems-flow-pill icon-glow" style={styles.systemsFlowPill}>
              <span style={styles.systemsFlowNode}>
                <StepIcon name="db" size={20} />
                <span style={styles.systemsFlowLabel}>Your system</span>
              </span>
              <span className="systems-flow-arrow" style={styles.systemsFlowArrow}>→</span>
              <span style={styles.systemsFlowNode}>
                <StepIcon name="file" size={20} />
                <span style={styles.systemsFlowLabel}>Excel / CSV</span>
              </span>
              <span className="systems-flow-arrow" style={styles.systemsFlowArrow}>→</span>
              <span style={styles.systemsFlowLabel}>saleis.live</span>
              <span className="systems-flow-arrow" style={styles.systemsFlowArrow}>→</span>
              <span style={styles.systemsFlowNode}>
                <StepIcon name="store" size={20} />
                <span style={styles.systemsFlowLabel}>Live sale</span>
              </span>
            </div>
            <h2 style={{ ...styles.h2, marginTop: 56 }}>What do all these systems have in common?</h2>
            <div style={styles.tickerBandLight}>
              <div className="marketing-ticker-track">
                {[...SYSTEMS, ...SYSTEMS].map((sys, i) => (
                  <span key={sys + i} style={styles.systemsTickerItem}>
                    {sys}
                    <span style={styles.systemsTickerDot}>·</span>
                  </span>
                ))}
              </div>
            </div>
            <p className="systems-payoff" style={styles.systemsPayoff}>
              They all speak Excel. saleis.live starts there.
            </p>
          </div>
        </section>
      </Reveal>

      {/* 04 — Built to integrate: technical register, tinted band. */}
      <Reveal>
        <section id="integrate" style={{ ...styles.integrateSection, background: colors.paper }}>
          <div style={styles.integrateHead}>
            <h2 style={styles.h2}>Built to integrate</h2>
            <p style={{ ...styles.integrateBody, textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>saleis.live is designed as a platform, not a closed storefront. Connect product data, payments, fulfilment and existing commerce infrastructure.</p>
            <a href="#/developers" className="marketing-arrow-link" style={{ ...styles.integrateLink, display: "flex", justifyContent: "center" }}>
              Developers <span className="arrow-glyph">→</span>
            </a>
          </div>
          <div className="marketing-spec-row" style={{ marginTop: 40 }}>
            {INTEGRATIONS.map((item, i) => (
              <div key={item.label} style={styles.specItem}>
                <div className="icon-glow" style={styles.stepIconBox}>
                  <StepIcon name={item.icon} size={24} />
                </div>
                <div>
                  <span style={styles.specIndex}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={styles.specLabel}>{item.label}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* 05 — Why saleis.live: titled, iconed, symmetric grid. */}
      <Reveal>
        <section id="why" style={styles.whySection}>
          <h2 style={styles.h2}>
            Why saleis.live
          </h2>
          <div className="marketing-why-grid">
            {TRUST_BAR.map((t) => (
              <div key={t.title}>
                <div className="icon-glow" style={styles.stepIconBox}>
                  <StepIcon name={t.icon} size={24} />
                </div>
                <h3 style={styles.whyTitle}>{t.title}</h3>
                <p style={styles.whyBody}>{t.body}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* 06 — Final CTA: statement + button + space, nothing else. Last section before the footer. */}
      <section id="cta" style={styles.ctaBand}>
        <h2 style={styles.ctaTitle}>Your sale. Your brand. Our technology.</h2>
        <p style={styles.ctaSub}>Join brands and retailers using saleis.live to unlock value from unsold stock.</p>
        <a href={ADMIN_URL} className="marketing-cta-btn" style={styles.ctaButton}>
          Get saleis.live
        </a>
      </section>
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
          <div className="icon-glow" style={styles.devCardIcon}>
            <ShieldIcon />
          </div>
          <h3 style={styles.devCardTitle}>Architecture</h3>
          <p style={styles.devCardBody}>
            A typed monorepo: shared domain types, a design-token package, an Express API, and separate React apps for the admin panel and each brand's storefront. Every business record carries a tenant and brand
            id — isolation is enforced at the data layer, not just the UI.
          </p>
        </div>
        <div style={styles.devCard}>
          <div className="icon-glow" style={styles.devCardIcon}>
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
          <div className="icon-glow" style={styles.devCardIcon}>
            <MonitorIcon />
          </div>
          <h3 style={styles.devCardTitle}>Installable admin panel</h3>
          <p style={styles.devCardBody}>
            A per-brand installable app for the merchant side (your own name, icon, and colors on your home screen) is in progress. The buyer-facing storefront stays link-based by design — no install friction
            for someone who just wants to check out.
          </p>
        </div>
        <div style={styles.devCard}>
          <div className="icon-glow" style={styles.devCardIcon}>
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

/**
 * Real Heroicons (MIT-licensed, solid style) path data — a designed icon
 * set rather than hand-drawn stroke glyphs, per Ola's feedback that the
 * earlier outline icons didn't look "artistic" or finished.
 */
const STEP_ICON_PATHS: Record<string, string[]> = {
  upload: [
    "M11.47 2.47a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06l-3.22-3.22V16.5a.75.75 0 0 1-1.5 0V4.81L8.03 8.03a.75.75 0 0 1-1.06-1.06l4.5-4.5ZM3 15.75a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z",
  ],
  sparkle: [
    "M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z",
  ],
  store: [
    "M5.223 2.25c-.497 0-.974.198-1.325.55l-1.3 1.298A3.75 3.75 0 0 0 7.5 9.75c.627.47 1.406.75 2.25.75.844 0 1.624-.28 2.25-.75.626.47 1.406.75 2.25.75.844 0 1.623-.28 2.25-.75a3.75 3.75 0 0 0 4.902-5.652l-1.3-1.299a1.875 1.875 0 0 0-1.325-.549H5.223Z",
    "M3 20.25v-8.755c1.42.674 3.08.673 4.5 0A5.234 5.234 0 0 0 9.75 12c.804 0 1.568-.182 2.25-.506a5.234 5.234 0 0 0 2.25.506c.804 0 1.567-.182 2.25-.506 1.42.674 3.08.675 4.5.001v8.755h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3Zm3-6a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-3Zm8.25-.75a.75.75 0 0 0-.75.75v5.25c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75v-5.25a.75.75 0 0 0-.75-.75h-3Z",
  ],
  code: [
    "M14.447 3.026a.75.75 0 0 1 .527.921l-4.5 16.5a.75.75 0 0 1-1.448-.394l4.5-16.5a.75.75 0 0 1 .921-.527ZM16.72 6.22a.75.75 0 0 1 1.06 0l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06L21.44 12l-4.72-4.72a.75.75 0 0 1 0-1.06Zm-9.44 0a.75.75 0 0 1 0 1.06L2.56 12l4.72 4.72a.75.75 0 0 1-1.06 1.06L.97 12.53a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z",
  ],
  layers: [
    "M3 6a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3V6ZM3 15.75a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2.25Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3v-2.25Z",
  ],
  phone: [
    "M10.5 18.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z",
    "M8.625.75A3.375 3.375 0 0 0 5.25 4.125v15.75a3.375 3.375 0 0 0 3.375 3.375h6.75a3.375 3.375 0 0 0 3.375-3.375V4.125A3.375 3.375 0 0 0 15.375.75h-6.75ZM7.5 4.125C7.5 3.504 8.004 3 8.625 3H9.75v.375c0 .621.504 1.125 1.125 1.125h2.25c.621 0 1.125-.504 1.125-1.125V3h1.125c.621 0 1.125.504 1.125 1.125v15.75c0 .621-.504 1.125-1.125 1.125h-6.75A1.125 1.125 0 0 1 7.5 19.875V4.125Z",
  ],
  card: [
    "M4.5 3.75a3 3 0 0 0-3 3v.75h21v-.75a3 3 0 0 0-3-3h-15Z",
    "M22.5 9.75h-21v7.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-7.5Zm-18 3.75a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z",
  ],
  truck: [
    "M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25ZM13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875h.375a3 3 0 1 1 6 0h3a.75.75 0 0 0 .75-.75V15Z",
    "M8.25 19.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0ZM15.75 6.75a.75.75 0 0 0-.75.75v11.25c0 .087.015.17.042.248a3 3 0 0 1 5.958.464c.853-.175 1.522-.935 1.464-1.883a18.659 18.659 0 0 0-3.732-10.104 1.837 1.837 0 0 0-1.47-.725H15.75Z",
    "M19.5 19.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z",
  ],
  db: [
    "M21 6.375c0 2.692-4.03 4.875-9 4.875S3 9.067 3 6.375 7.03 1.5 12 1.5s9 2.183 9 4.875Z",
    "M12 12.75c2.685 0 5.19-.586 7.078-1.609a8.283 8.283 0 0 0 1.897-1.384c.016.121.025.244.025.368C21 12.817 16.97 15 12 15s-9-2.183-9-4.875c0-.124.009-.247.025-.368a8.285 8.285 0 0 0 1.897 1.384C6.809 12.164 9.315 12.75 12 12.75Z",
    "M12 16.5c2.685 0 5.19-.586 7.078-1.609a8.282 8.282 0 0 0 1.897-1.384c.016.121.025.244.025.368 0 2.692-4.03 4.875-9 4.875s-9-2.183-9-4.875c0-.124.009-.247.025-.368a8.284 8.284 0 0 0 1.897 1.384C6.809 15.914 9.315 16.5 12 16.5Z",
    "M12 20.25c2.685 0 5.19-.586 7.078-1.609a8.282 8.282 0 0 0 1.897-1.384c.016.121.025.244.025.368 0 2.692-4.03 4.875-9 4.875s-9-2.183-9-4.875c0-.124.009-.247.025-.368a8.284 8.284 0 0 0 1.897 1.384C6.809 19.664 9.315 20.25 12 20.25Z",
  ],
  shield: [
    "M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Zm3.094 8.016a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z",
  ],
  star: [
    "M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z",
  ],
  file: [
    "M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5H5.625Z",
    "M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z",
  ],
};

function withLogo(text: string): React.ReactNode {
  const parts = text.split("saleis.live");
  if (parts.length === 1) return text;
  const out: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    out.push(<Fragment key={"t" + i}>{part}</Fragment>);
    if (i < parts.length - 1) {
      out.push(
        <span key={"l" + i} className="heading-logo">
          <Logo height={13} />
        </span>,
      );
    }
  });
  return out;
}

function StepIcon({ name, size = 20 }: { name?: string; size?: number }) {
  const paths = name ? STEP_ICON_PATHS[name] : undefined;
  if (!paths) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={colors.navy}>
      {paths.map((d) => (
        <path key={d} fillRule="evenodd" clipRule="evenodd" d={d} />
      ))}
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none" stroke={colors.stone} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

  header: { position: "sticky", top: 0, zIndex: 10, background: "transparent", transition: "background 0.3s ease, box-shadow 0.3s ease, backdrop-filter 0.3s ease" },
  headerScrolled: { background: "rgba(245,242,235,0.72)", backdropFilter: "blur(14px) saturate(1.4)", WebkitBackdropFilter: "blur(14px) saturate(1.4)", boxShadow: "0 1px 0 rgba(0,0,0,0.06)" },
  headerInner: { maxWidth: 1320, margin: "0 auto", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand: { display: "flex", alignItems: "center", textDecoration: "none" },
  navLink: { fontSize: 14, fontWeight: 600, color: colors.ink, textDecoration: "none" },
  navCta: { fontSize: 13, fontWeight: 700, color: colors.white, background: colors.navy, padding: "10px 18px", borderRadius: 999, textDecoration: "none", whiteSpace: "nowrap" },
  backLink: { display: "inline-block", fontSize: 13, fontWeight: 600, color: colors.muted, textDecoration: "none" },

  // Hero — desktop: full-bleed image, text overlaid on the image's own negative space.
  heroDesktop: { position: "relative", minHeight: "min(84vh, 760px)", overflow: "hidden" },
  heroDesktopImage: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "68% center" },
  heroDesktopContent: { position: "relative", height: "100%", maxWidth: 1320, margin: "0 auto", padding: "0 32px", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "min(84vh, 760px)" },

  // Hero — mobile: same overlay pattern as desktop, text set into the image's own negative space.
  heroMobile: { position: "relative", overflow: "hidden" },
  heroMobileImage: { width: "100%", display: "block", aspectRatio: "941 / 1672", objectFit: "cover", objectPosition: "center top" },
  heroMobileContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    padding: "8% 24px 0",
    textAlign: "left",
  },

  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: colors.navy, margin: "0 0 16px" },
  h1: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 88, lineHeight: 1.02, margin: "0 0 22px", color: colors.navy, maxWidth: 560 },
  h2: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 40, lineHeight: 1.1, margin: 0, textAlign: "center", color: colors.navy },
  heroSub: { fontSize: 18, color: colors.muted, margin: 0, maxWidth: 420, lineHeight: 1.55 },
  primaryButton: { display: "inline-block", background: colors.navy, color: colors.white, fontSize: 14, fontWeight: 700, padding: "15px 28px", borderRadius: 999, textDecoration: "none" },
  secondaryButton: { display: "inline-block", background: "transparent", color: colors.ink, fontSize: 14, fontWeight: 700, padding: "15px 28px", borderRadius: 999, textDecoration: "none", border: `1px solid ${colors.border}` },


  tickerBand: { background: colors.navy, padding: "16px 0", overflow: "hidden" },
  tickerItem: { display: "inline-flex", alignItems: "center", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 16, fontWeight: 500, color: colors.white, padding: "0 28px", whiteSpace: "nowrap" },
  tickerDot: { marginLeft: 28, color: "rgba(255,255,255,0.35)" },

  systemsCard: { border: `1px solid ${colors.border}`, borderRadius: 16, padding: "56px 40px", background: colors.surface },
  systemsFlowPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    background: colors.bluepale,
    borderRadius: 999,
    padding: "14px 24px",
  },
  systemsFlowNode: { display: "inline-flex", alignItems: "center", gap: 8 },
  systemsFlowLabel: { fontFamily: typography.fontFamily.ui, fontWeight: 700, fontSize: 13, letterSpacing: 0.3, color: colors.navy, whiteSpace: "nowrap" },
  systemsFlowArrow: { color: colors.navy, fontSize: 18, lineHeight: 1 },
  systemsPayoff: {
    fontFamily: DISPLAY_FONT,
    fontWeight: 500,
    fontSize: "clamp(24px, 3.4vw, 36px)",
    color: colors.navy,
    marginTop: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  tickerBandLight: { marginTop: 40, background: colors.bluepale, borderRadius: 16, padding: "18px 0", overflow: "hidden" },
  systemsTickerItem: { display: "inline-flex", alignItems: "center", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 16, fontWeight: 600, color: colors.navy, padding: "0 24px", whiteSpace: "nowrap" },
  systemsTickerDot: { marginLeft: 24, color: "rgba(23,59,143,0.3)" },

  section: { padding: "96px 32px", maxWidth: 1320, margin: "0 auto" },
  sectionSub: { fontSize: 16, color: colors.muted, textAlign: "center", maxWidth: 560, margin: "16px auto 0" },

  // 02 — how it works — horizontal 3-column sequence, numeral badge + icon box, matching the approved board.
  howSection: { padding: "88px 32px", maxWidth: 1200, margin: "0 auto" },
  stepColHead: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 },
  stepNumberBadge: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: colors.surface,
    color: colors.navy,
    fontWeight: 700,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontVariantNumeric: "lining-nums tabular-nums",
  },
  stepIconBox: { width: 56, height: 56, borderRadius: 14, background: colors.bluepale, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepRowTitle: { fontSize: 19, fontWeight: 600, margin: "0 0 8px", color: colors.navy },
  stepRowBody: { fontSize: 16, color: colors.muted, lineHeight: 1.6, margin: 0 },

  // 03 — see saleis.live in action — equal panels inside one bordered frame
  actionSection: { padding: "96px 32px", maxWidth: 1320, margin: "0 auto" },
  actionFrame: { marginTop: 56, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 40, background: colors.surface },
  actionPanel: { display: "block", textDecoration: "none", color: colors.ink },
  actionImageFrame: { position: "relative", aspectRatio: "1280 / 620", borderRadius: 8, overflow: "hidden", background: colors.paper },
  actionImage: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" },
  actionCaption: { paddingTop: 22 },
  actionEyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: colors.navy, margin: "0 0 8px" },
  actionBadge: { display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: colors.navy, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 999, padding: "6px 14px", margin: "0 0 14px" },
  actionText: { fontSize: 16, color: colors.muted, lineHeight: 1.6, margin: "0 0 10px" },
  actionLink: { fontSize: 15, fontWeight: 700, color: colors.navy },

  // 04 — built to integrate
  integrateSection: { padding: "96px 32px", maxWidth: 1320, margin: "0 auto", textAlign: "center" },
  integrateHead: { maxWidth: 640, margin: "0 auto" },
  integrateBody: { fontSize: 16, color: colors.muted, lineHeight: 1.6, margin: "16px 0 14px" },
  integrateLink: { fontSize: 15, fontWeight: 700, color: colors.navy, textDecoration: "none" },
  specItem: { padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 },
  specIndex: { display: "block", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: colors.muted, marginBottom: 4 },
  specLabel: { display: "block", fontSize: 15, fontWeight: 600, color: colors.ink },

  devCard: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 32, textAlign: "center" },
  devCardIcon: { width: 52, height: 52, borderRadius: 12, background: colors.bluepale, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" },
  devCardTitle: { fontFamily: DISPLAY_FONT, fontSize: 26, color: colors.navy, fontWeight: 500, margin: "0 0 14px" },
  devCardBody: { fontSize: 14, color: colors.muted, lineHeight: 1.7, margin: "0 auto", maxWidth: 420, textAlign: "left" },
  codeBlock: { fontSize: 11, lineHeight: 1.6, background: colors.background, borderRadius: 8, padding: 14, marginTop: 14, overflowX: "auto", whiteSpace: "pre", textAlign: "left" },

  // 07 — final CTA
  ctaBand: { background: colors.navy, padding: "112px 32px", textAlign: "center" },
  ctaTitle: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 48, color: colors.white, margin: "0 0 16px" },
  ctaSub: { fontSize: 16, color: colors.stone, margin: "0 0 32px", maxWidth: 480, marginLeft: "auto", marginRight: "auto" },
  ctaButton: { display: "inline-block", background: colors.white, color: colors.ink, fontSize: 14, fontWeight: 700, padding: "16px 32px", borderRadius: 999, textDecoration: "none" },

  // 06 — why saleis.live (editorial statements)
  whySection: { padding: "96px 32px", maxWidth: 1200, margin: "0 auto" },
  whyTitle: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 21, color: colors.navy, margin: "16px 0 8px", lineHeight: 1.25 },
  whyBody: { fontSize: 15, color: colors.muted, lineHeight: 1.6, margin: 0 },

  footer: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "32px", background: "#F7F2ED" },
};
