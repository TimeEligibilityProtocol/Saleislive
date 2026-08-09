import { colors, typography } from "@saleis-live/ui";
import { Fragment, useEffect, useState } from "react";
import { Logo } from "./components/Logo";
import { ADMIN_URL, DEMO_STORE_URL } from "./config/links";

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Demo", href: "#demo" },
  { label: "Developers", href: "#/developers" },
];

const MINI_STEPS = [
  { icon: <UploadIcon />, title: "Upload any stock", body: "Excel, CSV or photos. We handle the rest." },
  { icon: <SparkleIcon />, title: "AI prepares catalogue", body: "Clean, enrich, translate and organise." },
  { icon: <StoreIcon />, title: "Launch your sale", body: "Branded storefront, payments and delivery." },
];

const STEPS = [
  { icon: <FileIcon />, title: "Upload your stock", body: "Add inventory via Excel, CSV or product photos." },
  { icon: <SparkleIcon />, title: "AI prepares your catalogue", body: "saleis.live maps data, matches product images, cleans and enriches content and flags anything that needs review." },
  { icon: <StoreIcon />, title: "Launch your branded sale", body: "Publish a complete branded storefront with products, payments, orders and delivery." },
];

const INTEGRATIONS = [
  { icon: <CodeIcon />, label: "API-ready" },
  { icon: <LayersIcon />, label: "Multi-brand" },
  { icon: <PhoneIcon />, label: "PWA" },
  { icon: <CardIcon />, label: "Payments" },
  { icon: <TruckIcon />, label: "Delivery" },
  { icon: <DbIcon />, label: "Data import" },
];

const TRUST_BAR = [
  { icon: <SparkleIcon size={28} />, title: "Turn unsold stock", body: "Bring inventory sitting in storage or spreadsheets back to life and start selling it — without discounting your brand." },
  { icon: <ShieldCheckIcon />, title: "Secure, private & infrastructure-free", body: "Your data stays yours. We handle the technology, security and uptime — so you can focus on growth." },
  { icon: <CodeIcon size={28} />, title: "Built for scale — from day one", body: "Whether it's 100 or 100,000 products, saleis.live is built to scale with your business." },
  { icon: <StarIcon />, title: "Your brand. Fully owned.", body: "Your storefront, your domain, your rules. We power it, you own it — 100%." },
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

export function App() {
  const scrolled = useScrolled();
  const hash = useHashRoute();
  const onDevelopers = hash.startsWith("#/developers");

  return (
    <div style={styles.page}>
      <style>{`
        .marketing-nav-links { display: flex; gap: 28px; }
        @media (max-width: 780px) { .marketing-nav-links { display: none; } }
        .marketing-hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
        @media (max-width: 900px) { .marketing-hero-grid { grid-template-columns: 1fr; } }
        .marketing-mini-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .marketing-mini-steps > div:not(:first-child) { border-left: 1px solid ${colors.border}; padding-left: 20px; }
        @media (max-width: 620px) {
          .marketing-mini-steps { grid-template-columns: 1fr; }
          .marketing-mini-steps > div:not(:first-child) { border-left: none; padding-left: 0; }
        }
        .marketing-steps { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap: 16px; align-items: start; }
        @media (max-width: 780px) { .marketing-steps { grid-template-columns: 1fr; } }
        .marketing-step-arrow { display: flex; align-items: center; justify-content: center; padding-top: 20px; }
        @media (max-width: 780px) { .marketing-step-arrow { display: none; } }
        .marketing-demo-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 780px) { .marketing-demo-cards { grid-template-columns: 1fr; } }
        .marketing-integrate-row { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
        .marketing-trust-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; }
        @media (min-width: 901px) { .marketing-trust-bar > div:not(:first-child) { border-left: 1px solid ${colors.border}; padding-left: 24px; } }
        @media (max-width: 900px) { .marketing-trust-bar { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px) { .marketing-trust-bar { grid-template-columns: 1fr; } }
        .marketing-dev-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 780px) { .marketing-dev-grid { grid-template-columns: 1fr; } }
        .board-mobile { display: none; }
        @media (max-width: 780px) {
          .board-desktop { display: none; }
          .board-mobile { display: block; }
        }
        @media (max-width: 480px) {
          .brand svg { height: 38px !important; width: auto !important; }
          .marketing-nav-cta { font-size: 12px !important; padding: 8px 14px !important; }
        }
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

function BoardImage({
  desktopSrc,
  desktopRatio,
  mobileSrc,
  mobileRatio,
  alt,
  desktopHotspots,
  mobileHotspots,
}: {
  desktopSrc: string;
  desktopRatio: string;
  mobileSrc?: string;
  mobileRatio?: string;
  alt: string;
  desktopHotspots?: Array<{ href: string; label: string; box: [number, number, number, number] }>;
  mobileHotspots?: Array<{ href: string; label: string; box: [number, number, number, number] }>;
}) {
  return (
    <>
      <div className="board-desktop" style={{ maxWidth: 1264, margin: "0 auto", padding: "0 32px", boxSizing: "border-box" }}>
        <div style={{ position: "relative" }}>
          <img src={desktopSrc} alt={alt} style={{ width: "100%", display: "block", aspectRatio: desktopRatio }} />
          {desktopHotspots?.map((h) => (
            <a key={h.label} href={h.href} aria-label={h.label} style={hotspotStyle(h.box)} />
          ))}
        </div>
      </div>
      {mobileSrc ? (
        <div className="board-mobile" style={{ position: "relative" }}>
          <img src={mobileSrc} alt={alt} style={{ width: "100%", display: "block", aspectRatio: mobileRatio }} />
          {mobileHotspots?.map((h) => (
            <a key={h.label} href={h.href} aria-label={h.label} style={hotspotStyle(h.box)} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function hotspotStyle([left, top, width, height]: [number, number, number, number]): React.CSSProperties {
  return { position: "absolute", left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` };
}

function HomePage() {
  return (
    <>
      <section id="product">
        <BoardImage
          alt="Stock in. Sale live. The AI-powered platform that turns unsold stock into a complete branded sale."
          desktopSrc="/images/boards/01-home-laptop.png"
          desktopRatio="3072 / 2048"
          mobileSrc="/images/boards/01-hero-mobile.png"
          mobileRatio="1148 / 1370"
          desktopHotspots={[
            { href: ADMIN_URL, label: "Get saleis.live", box: [6.45, 57.6, 15.2, 6.1] },
            { href: "#demo", label: "View demo", box: [23.4, 57.6, 12.6, 6.1] },
          ]}
          mobileHotspots={[
            { href: ADMIN_URL, label: "Get saleis.live", box: [19.2, 35.6, 32.2, 4.8] },
            { href: "#demo", label: "View demo", box: [19.2, 42.9, 32.2, 4.6] },
          ]}
        />
      </section>

      <section id="how-it-works">
        <BoardImage
          alt="How saleis.live works — three simple steps from stock to sale."
          desktopSrc="/images/boards/02-how-it-works-laptop.png"
          desktopRatio="3282 / 1396"
          mobileSrc="/images/boards/02-how-it-works-mobile.png"
          mobileRatio="1148 / 1371"
        />
      </section>

      <section id="demo">
        <BoardImage
          alt="See saleis.live in action — for sellers, for buyers, and the sales dashboard."
          desktopSrc="/images/boards/03-in-action-laptop.png"
          desktopRatio="2945 / 1388"
          mobileSrc="/images/boards/03-in-action-mobile.png"
          mobileRatio="1147 / 1371"
          desktopHotspots={[
            { href: ADMIN_URL, label: "Start selling now", box: [0.71, 80.3, 13.04, 8.26] },
            { href: DEMO_STORE_URL, label: "Shop sales live", box: [33.14, 80.3, 12.39, 8.26] },
          ]}
        />
      </section>

      <section>
        <BoardImage
          alt="Built to integrate — saleis.live is designed as a platform, not a closed storefront."
          desktopSrc="/images/boards/04-built-to-integrate-laptop.png"
          desktopRatio="4096 / 1368"
          desktopHotspots={[{ href: "#/developers", label: "Developers", box: [4.86, 68.2, 8.24, 5.2] }]}
        />
      </section>

      <section>
        <BoardImage
          alt="Your sale. Your brand. Our technology."
          desktopSrc="/images/boards/05-cta-laptop.png"
          desktopRatio="4254 / 1478"
          desktopHotspots={[{ href: ADMIN_URL, label: "Get saleis.live", box: [42.06, 62.86, 17.44, 11.77] }]}
        />
      </section>

      <section>
        <BoardImage alt="Turn unsold stock. Secure, private and infrastructure-free. Built for scale. Your brand, fully owned." desktopSrc="/images/boards/06-icons-laptop.png" desktopRatio="2172 / 724" />
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
      <div style={{ marginTop: 16 }}>
        <BoardImage alt="Built as a platform: architecture, payments and delivery, installable admin panel, deployment." desktopSrc="/images/boards/dev-laptop.png" desktopRatio="1536 / 1024" />
      </div>
    </section>
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

function SparkleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M15 2v5h5" />
      <path d="M9.5 12l2 4M11.5 12l-2 4M9 16h3" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z" />
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

function CodeIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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

function LayersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7h11v10H2zM13 10h5l3 3v4h-8z" />
      <circle cx="6" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </svg>
  );
}

function DbIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
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
  navCta: { fontSize: 13, fontWeight: 700, color: colors.white, background: colors.navy, padding: "10px 18px", borderRadius: 999, textDecoration: "none", whiteSpace: "nowrap" },
  backLink: { display: "inline-block", fontSize: 13, fontWeight: 600, color: colors.muted, textDecoration: "none" },

  hero: { padding: "64px 32px 96px" },
  heroInner: { maxWidth: 1200, margin: "0 auto" },
  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1, color: colors.navy, margin: "0 0 12px" },
  h1: { fontFamily: typography.fontFamily.display, fontSize: 56, lineHeight: 1.05, margin: "0 0 20px", color: colors.navy },
  h2Center: { fontFamily: typography.fontFamily.display, fontSize: 34, lineHeight: 1.2, margin: 0, textAlign: "center", color: colors.navy },
  heroSub: { fontSize: 18, color: colors.muted, margin: 0, maxWidth: 440, lineHeight: 1.5 },
  primaryButton: { display: "inline-block", background: colors.navy, color: colors.white, fontSize: 14, fontWeight: 700, padding: "14px 26px", borderRadius: 999, textDecoration: "none" },
  secondaryButton: { display: "inline-block", background: "transparent", color: colors.ink, fontSize: 14, fontWeight: 700, padding: "14px 26px", borderRadius: 999, textDecoration: "none", border: `1px solid ${colors.border}` },
  heroImageFrame: { position: "relative", aspectRatio: "1774 / 887", borderRadius: 16, overflow: "hidden", background: colors.paper },
  heroImage: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center bottom" },

  miniStepIcon: { width: 36, height: 36, borderRadius: 9, background: colors.bluepale, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  miniStepTitle: { fontSize: 13, fontWeight: 700, margin: "0 0 4px", color: colors.navy },
  miniStepBody: { fontSize: 12, color: colors.muted, margin: 0, lineHeight: 1.5 },

  section: { padding: "80px 32px", maxWidth: 1200, margin: "0 auto" },
  sectionSub: { fontSize: 15, color: colors.muted, textAlign: "center", maxWidth: 620, margin: "12px auto 0" },

  stepHead: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 20 },
  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: colors.bluepale,
    color: colors.navy,
    fontWeight: 700,
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepIconBox: { width: 64, height: 64, borderRadius: 14, background: colors.bluepale, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepTitle: { fontSize: 17, fontWeight: 700, margin: "0 0 8px", textAlign: "center", color: colors.navy },
  stepBody: { fontSize: 13, color: colors.muted, lineHeight: 1.6, margin: 0, textAlign: "center" },

  demoCard: { display: "block", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, overflow: "hidden", textDecoration: "none", color: colors.ink },
  demoCardImageFrame: { position: "relative", aspectRatio: "1280 / 620", background: colors.paper },
  demoCardImage: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" },
  demoCardEyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1, color: colors.navy, margin: "0 0 10px" },
  demoCardBody: { fontSize: 14, color: colors.muted, lineHeight: 1.6, margin: "0 0 16px" },
  demoCardLink: { fontSize: 14, fontWeight: 700, color: colors.navy },

  integrateCard: {
    background: colors.paper,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: 32,
    display: "flex",
    flexWrap: "wrap",
    gap: 32,
    alignItems: "center",
    justifyContent: "space-between",
  },
  integrateTitle: { fontFamily: typography.fontFamily.display, fontSize: 22, color: colors.navy, margin: "0 0 10px" },
  integrateBody: { fontSize: 13, color: colors.muted, lineHeight: 1.6, margin: "0 0 12px" },
  integrateLink: { fontSize: 13, fontWeight: 700, color: colors.navy, textDecoration: "none" },
  integrateIcon: { width: 44, height: 44, borderRadius: 10, background: colors.bluepale, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  integrateIconLabel: { fontSize: 11, color: colors.muted, margin: 0 },

  devCard: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 32 },
  devCardIcon: { width: 52, height: 52, borderRadius: 12, background: colors.bluepale, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  devCardTitle: { fontFamily: typography.fontFamily.display, fontSize: 26, color: colors.navy, fontWeight: 400, margin: "0 0 14px" },
  devCardBody: { fontSize: 14, color: colors.muted, lineHeight: 1.7, margin: 0 },
  codeBlock: { fontSize: 11, lineHeight: 1.6, background: colors.background, borderRadius: 8, padding: 14, marginTop: 14, overflowX: "auto", whiteSpace: "pre" },

  ctaBand: { background: colors.navy, padding: "72px 32px", textAlign: "center" },
  ctaTitle: { fontFamily: typography.fontFamily.display, fontSize: 32, color: colors.white, margin: "0 0 12px" },
  ctaSub: { fontSize: 15, color: colors.stone, margin: "0 0 28px", maxWidth: 480, marginLeft: "auto", marginRight: "auto" },
  ctaButton: { display: "inline-block", background: colors.white, color: colors.ink, fontSize: 14, fontWeight: 700, padding: "14px 28px", borderRadius: 999, textDecoration: "none" },

  trustIcon: { marginBottom: 16 },
  trustTitle: { fontFamily: typography.fontFamily.display, fontSize: 19, fontWeight: 400, color: colors.navy, margin: "0 0 10px" },
  trustBody: { fontSize: 13, color: colors.muted, lineHeight: 1.6, margin: 0 },

  footer: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "32px", background: "#F7F2ED" },
};
