import { colors, typography } from "@saleis-live/ui";
import { Brand, Money, Product } from "@saleis-live/domain";
import { useEffect, useState } from "react";
import { apiClient } from "./config/apiClient";

function formatMoney(m: Money): string {
  return `${m.currency} ${(m.amountMinor / 100).toFixed(0)}`;
}

function discountPercent(price: Money, salePrice: Money): number {
  if (price.amountMinor === 0) return 0;
  return Math.round((1 - salePrice.amountMinor / price.amountMinor) * 100);
}

type LoadState = "loading" | "not_found" | "ready";

export function App() {
  const [state, setState] = useState<LoadState>("loading");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getCurrentStorefrontBrand()
      .then((b) => {
        if (cancelled) return;
        setBrand(b);
        return apiClient.listStorefrontProducts();
      })
      .then((p) => {
        if (cancelled || !p) return;
        setProducts(p);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("not_found");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return <div style={styles.centeredPage}>Loading…</div>;
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

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brandName}>{brand.name}</div>
        <div style={styles.hostPill}>{brand.slug}.saleis.live</div>
      </header>

      <section style={styles.hero}>
        <p style={styles.eyebrow}>PRIVATE SALE</p>
        <h1 style={styles.h1}>The {brand.name} sale is live.</h1>
        <p style={styles.heroSub}>Selected pieces. Limited time.</p>
      </section>

      <section style={styles.grid}>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </section>

      <footer style={styles.footer}>
        <div style={styles.footerBrand}>
          <Logo />
          <span>
            saleis<span style={{ color: colors.ultramarine }}>.live</span>
          </span>
        </div>
        <span style={{ fontSize: 12, color: "#8A8578" }}>Powered by saleis.live</span>
      </footer>
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const pct = discountPercent(product.price, product.salePrice);
  return (
    <div style={styles.card}>
      <div style={styles.cardImageWrap}>
        <img src={apiClient.resolveAssetUrl(product.images[0]?.url ?? "")} alt={product.images[0]?.alt ?? ""} style={styles.cardImage} />
      </div>
      <p style={styles.cardName}>{product.name.value}</p>
      <p style={styles.cardPriceRow}>
        <span style={styles.cardPriceStrike}>{formatMoney(product.price)}</span>
        <span style={styles.cardPrice}>{formatMoney(product.salePrice)}</span>
        {pct > 0 ? <span style={styles.cardPct}>−{pct}%</span> : null}
      </p>
    </div>
  );
}

function Logo() {
  return (
    <svg width="16" height="16" viewBox="-14 -14 28 28" style={{ marginRight: 6 }}>
      <g fill={colors.navy}>
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <rect key={deg} x="-2.1" y="-11.6" width="4.2" height="9.3" rx="2.1" transform={`rotate(${deg})`} />
        ))}
      </g>
    </svg>
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
  brandName: { fontSize: 18, fontWeight: 700 },
  hostPill: { fontSize: 12, color: "#8A8578" },
  hero: { padding: "56px 32px", maxWidth: 640 },
  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1, color: colors.ultramarine, margin: "0 0 12px" },
  h1: { fontFamily: typography.fontFamily.display, fontSize: 44, margin: "0 0 8px", lineHeight: 1.1 },
  heroSub: { fontSize: 15, color: "#5C574C", margin: 0 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 24,
    padding: "0 32px 56px",
  },
  card: { display: "flex", flexDirection: "column", gap: 8 },
  cardImageWrap: { aspectRatio: "4/5", borderRadius: 12, overflow: "hidden", background: colors.surface },
  cardImage: { width: "100%", height: "100%", objectFit: "cover" },
  cardName: { fontSize: 14, fontWeight: 500, margin: 0 },
  cardPriceRow: { display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 14 },
  cardPriceStrike: { textDecoration: "line-through", color: "#8A8578" },
  cardPrice: { fontWeight: 700 },
  cardPct: { color: colors.ultramarine, fontWeight: 600, fontSize: 12 },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "24px 32px",
    borderTop: `1px solid ${colors.border}`,
  },
  footerBrand: { display: "flex", alignItems: "center", fontSize: 13, fontWeight: 700 },
};
