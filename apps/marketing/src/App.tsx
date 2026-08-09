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

const MINI_STEPS = [
  { icon: "upload", title: "Upload any stock", body: "Excel, CSV or photos." },
  { icon: "sparkle", title: "AI prepares catalogue", body: "Clean, enrich, translate." },
  { icon: "store", title: "Launch your sale", body: "Storefront, payments, delivery." },
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

const CATEGORY_TICKER = ["yourbrand", "clothes", "beauty", "shoes", "jewelry", "home", "cosmetics", "accessories"].map((slug) => `${slug}.saleis.live`);

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

        .marketing-mini-steps { display: flex; gap: 24px; }
        .marketing-mini-steps > div:not(:first-child) { border-left: 1px solid rgba(23,59,143,0.18); padding-left: 24px; }
        @media (max-width: 620px) { .marketing-mini-steps { flex-direction: column; gap: 16px; } .marketing-mini-steps > div:not(:first-child) { border-left: none; padding-left: 0; } }

        .marketing-steps-row { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap: 20px; align-items: start; }
        @media (max-width: 900px) { .marketing-steps-row { grid-template-columns: 1fr; } }
        .marketing-step-arrow { display: flex; align-items: center; justify-content: center; padding-top: 28px; }
        @media (max-width: 900px) { .marketing-step-arrow { display: none; } }

        .marketing-action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: start; }
        @media (max-width: 900px) { .marketing-action-grid { grid-template-columns: 1fr; gap: 32px; } }

        .marketing-spec-row { display: flex; border-top: 1px solid ${colors.border}; border-bottom: 1px solid ${colors.border}; }
        .marketing-spec-row > div { flex: 1; border-left: 1px solid ${colors.border}; }
        .marketing-spec-row > div:first-child { border-left: none; }
        @media (max-width: 780px) {
          .marketing-spec-row { display: grid; grid-template-columns: 1fr 1fr; border-left: 1px solid ${colors.border}; }
          .marketing-spec-row > div { border-left: none; border-right: 1px solid ${colors.border}; border-bottom: 1px solid ${colors.border}; }
          .marketing-spec-row > div:nth-child(2n) { border-right: none; }
        }

        .marketing-why-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; margin-top: 56px; text-align: center; justify-items: center; }
        @media (max-width: 900px) { .marketing-why-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px) { .marketing-why-grid { grid-template-columns: 1fr; } }

        .marketing-dev-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 780px) { .marketing-dev-grid { grid-template-columns: 1fr; } }

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
            <div className="marketing-mini-steps" style={{ marginTop: 48 }}>
              {MINI_STEPS.map((s) => (
                <div key={s.title} style={styles.miniStepItem}>
                  <div style={styles.miniStepIcon}>
                    <StepIcon name={s.icon} size={20} />
                  </div>
                  <p style={styles.miniStepTitle}>{s.title}</p>
                  <p style={styles.miniStepBody}>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="hero-mobile" style={styles.heroMobile}>
        <img src="/images/hero-product.png" alt="Products staged for a branded sale generated by saleis.live" style={styles.heroMobileImage} />
        <div className="hero-enter" style={styles.heroMobileContent}>
          <h1 style={{ ...styles.h1, fontSize: 48 }}>
            Stock in.
            <br />
            Sale live.
          </h1>
          <p style={styles.heroSub}>The AI-powered platform that turns unsold stock into a complete branded sale — in days, not months.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
            <a href={ADMIN_URL} className="marketing-primary-btn" style={styles.primaryButton}>
              Get saleis.live
            </a>
            <a href="#demo" className="marketing-secondary-btn" style={styles.secondaryButton}>
              View demo
            </a>
          </div>
          <div className="marketing-mini-steps" style={{ marginTop: 32 }}>
            {MINI_STEPS.map((s) => (
              <div key={s.title} style={styles.miniStepItem}>
                <div style={styles.miniStepIcon}>
                  <StepIcon name={s.icon} size={20} />
                </div>
                <p style={styles.miniStepTitle}>{s.title}</p>
                <p style={styles.miniStepBody}>{s.body}</p>
              </div>
            ))}
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
          <h2 style={styles.h2}>How saleis.live works</h2>
          <p style={styles.sectionSub}>Three simple steps from stock to sale.</p>
          <div className="marketing-steps-row" style={{ marginTop: 56 }}>
            {STEPS.map((step, i) => (
              <Fragment key={step.title}>
                <div>
                  <div style={styles.stepColHead}>
                    <span style={styles.stepNumberBadge}>{String(i + 1).padStart(2, "0")}</span>
                    <div style={styles.stepIconBox}>
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
          <h2 style={styles.h2}>See saleis.live in action</h2>
          <p style={styles.sectionSub}>Real screenshots of the actual product — your own store, on your own subdomain, is what you get after "Get saleis.live".</p>
          <div style={styles.actionFrame}>
            <div className="marketing-action-grid" style={{ marginTop: 0 }}>
              <a href={ADMIN_URL} style={styles.actionPanel}>
                <div className="marketing-action-visual" style={styles.actionImageFrame}>
                  <img src="/images/admin-demo.jpg" alt="The real saleis.live admin panel" style={styles.actionImage} />
                </div>
                <div style={styles.actionCaption}>
                  <p style={styles.actionEyebrow}>FOR SELLERS</p>
                  <p style={styles.actionText}>Upload stock, edit with AI, and launch a branded sale — from one admin panel.</p>
                  <span className="marketing-arrow-link" style={styles.actionLink}>View admin demo <span className="arrow-glyph">→</span></span>
                </div>
              </a>
              <a href={DEMO_STORE_URL} style={styles.actionPanel}>
                <div className="marketing-action-visual" style={styles.actionImageFrame}>
                  <img src="/images/demo-store.jpg" alt="The real saleis.live demo storefront" style={styles.actionImage} />
                </div>
                <div style={styles.actionCaption}>
                  <p style={styles.actionEyebrow}>FOR BUYERS</p>
                  <p style={styles.actionText}>A branded storefront your customers browse, bag and check out from.</p>
                  <span className="marketing-arrow-link" style={styles.actionLink}>View demo store <span className="arrow-glyph">→</span></span>
                </div>
              </a>
            </div>
          </div>
        </section>
      </Reveal>

      {/* 04 — Built to integrate: technical register, tinted band. */}
      <Reveal>
        <section id="integrate" style={{ ...styles.integrateSection, background: colors.bluepale }}>
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
                <div style={styles.stepIconBox}>
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

      {/* 05 — Final CTA: statement + button + space, nothing else. */}
      <section id="cta" style={styles.ctaBand}>
        <h2 style={styles.ctaTitle}>Your sale. Your brand. Our technology.</h2>
        <p style={styles.ctaSub}>Join brands and retailers using saleis.live to unlock value from unsold stock.</p>
        <a href={ADMIN_URL} className="marketing-cta-btn" style={styles.ctaButton}>
          Get saleis.live
        </a>
      </section>

      {/* 06 — Why saleis.live: titled, iconed, symmetric grid. */}
      <Reveal>
        <section id="why" style={styles.whySection}>
          <h2 style={styles.h2}>Why saleis.live</h2>
          <div className="marketing-why-grid">
            {TRUST_BAR.map((t) => (
              <div key={t.title}>
                <div style={styles.stepIconBox}>
                  <StepIcon name={t.icon} size={24} />
                </div>
                <h3 style={styles.whyTitle}>{t.title}</h3>
                <p style={styles.whyBody}>{t.body}</p>
              </div>
            ))}
          </div>
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

const STEP_ICON_PATHS = {
  file: "M6 2h9l5 5v15H6z|M15 2v5h5",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4|M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18",
  store: "M4 9l1-5h14l1 5|M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0|M5 9v10h14V9|M10 19v-6h4v6",
  code: "M8 6L2 12l6 6M16 6l6 6-6 6",
  layers: "M12 3l9 5-9 5-9-5 9-5z|M3 13l9 5 9-5",
  phone: "M6 2h12v20H6z|M11 18h2",
  card: "M2 5h20v14H2z|M2 10h20M6 15h4",
  truck: "M2 7h11v10H2zM13 10h5l3 3v4h-8z|M6 18a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z|M17 18a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z",
  db: "M4 5c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z|M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5|M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  upload: "M12 15V4M12 4l-4.5 4.5M12 4l4.5 4.5|M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  shield: "M12 3l7.5 3.2v5.8c0 4.8-3.2 8-7.5 9.5-4.3-1.5-7.5-4.7-7.5-9.5V6.2L12 3z|M8.5 12l2.3 2.3L15.5 9.5",
  star: "M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z",
};

function StepIcon({ name, size = 20 }: { name?: string; size?: number }) {
  const paths = name ? STEP_ICON_PATHS[name as keyof typeof STEP_ICON_PATHS] : undefined;
  if (!paths) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths.split("|").map((d) => (
        <path key={d} d={d} />
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

  // Hero — mobile: image as a top band, content flows below (not a scaled desktop poster).
  heroMobileImage: { width: "100%", display: "block", aspectRatio: "1774 / 1180", objectFit: "cover", objectPosition: "70% center" },
  heroMobileContent: { padding: "36px 24px 48px" },

  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: colors.navy, margin: "0 0 16px" },
  h1: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 88, lineHeight: 1.02, margin: "0 0 22px", color: colors.navy, maxWidth: 560 },
  h2: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 40, lineHeight: 1.1, margin: 0, textAlign: "center", color: colors.navy },
  heroSub: { fontSize: 18, color: colors.muted, margin: 0, maxWidth: 420, lineHeight: 1.55 },
  primaryButton: { display: "inline-block", background: colors.navy, color: colors.white, fontSize: 14, fontWeight: 700, padding: "15px 28px", borderRadius: 999, textDecoration: "none" },
  secondaryButton: { display: "inline-block", background: "transparent", color: colors.ink, fontSize: 14, fontWeight: 700, padding: "15px 28px", borderRadius: 999, textDecoration: "none", border: `1px solid ${colors.border}` },

  miniStepItem: { flex: 1, minWidth: 160 },
  miniStepIcon: { width: 40, height: 40, borderRadius: 10, background: colors.bluepale, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  miniStepTitle: { fontSize: 14, fontWeight: 700, color: colors.navy, margin: "0 0 4px" },
  miniStepBody: { fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.5 },

  tickerBand: { background: colors.navy, padding: "16px 0", overflow: "hidden" },
  tickerItem: { display: "inline-flex", alignItems: "center", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 16, fontWeight: 500, color: colors.white, padding: "0 28px", whiteSpace: "nowrap" },
  tickerDot: { marginLeft: 28, color: "rgba(255,255,255,0.35)" },

  section: { padding: "140px 32px", maxWidth: 1320, margin: "0 auto" },
  sectionSub: { fontSize: 16, color: colors.muted, textAlign: "center", maxWidth: 560, margin: "16px auto 0" },

  // 02 — how it works — horizontal 3-column sequence, numeral badge + icon box, matching the approved board.
  howSection: { padding: "128px 32px", maxWidth: 1200, margin: "0 auto" },
  stepColHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 },
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
  actionSection: { padding: "140px 32px", maxWidth: 1320, margin: "0 auto" },
  actionFrame: { marginTop: 56, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 40, background: colors.surface },
  actionPanel: { display: "block", textDecoration: "none", color: colors.ink },
  actionImageFrame: { position: "relative", aspectRatio: "1280 / 620", borderRadius: 6, overflow: "hidden", background: colors.paper },
  actionImage: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" },
  actionCaption: { paddingTop: 22 },
  actionEyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: colors.navy, margin: "0 0 8px" },
  actionText: { fontSize: 16, color: colors.muted, lineHeight: 1.6, margin: "0 0 10px" },
  actionLink: { fontSize: 15, fontWeight: 700, color: colors.navy },

  // 04 — built to integrate
  integrateSection: { padding: "140px 32px", maxWidth: 1320, margin: "0 auto", textAlign: "center" },
  integrateHead: { maxWidth: 640, margin: "0 auto" },
  integrateBody: { fontSize: 16, color: colors.muted, lineHeight: 1.6, margin: "16px 0 14px" },
  integrateLink: { fontSize: 15, fontWeight: 700, color: colors.navy, textDecoration: "none" },
  specItem: { padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 },
  specIndex: { display: "block", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: colors.muted, marginBottom: 4 },
  specLabel: { display: "block", fontSize: 15, fontWeight: 600, color: colors.ink },

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
  whySection: { padding: "140px 32px", maxWidth: 1200, margin: "0 auto" },
  whyTitle: { fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 21, color: colors.navy, margin: "16px 0 8px", lineHeight: 1.25 },
  whyBody: { fontSize: 15, color: colors.muted, lineHeight: 1.6, margin: 0 },

  footer: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "32px", background: "#F7F2ED" },
};
