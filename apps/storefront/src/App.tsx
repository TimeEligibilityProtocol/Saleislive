import { colors, typography } from "@saleis-live/ui";
import { Brand, DeliveryMethod, Money, Product } from "@saleis-live/domain";
import { useEffect, useState } from "react";
import { Logo } from "./components/Logo";
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
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);

  const load = () => {
    apiClient
      .getCurrentStorefrontBrand()
      .then((b) => {
        setBrand(b);
        return apiClient.listStorefrontProducts();
      })
      .then((p) => {
        if (!p) return;
        setProducts(p);
        setState("ready");
      })
      .catch(() => {
        setState("not_found");
      });
  };

  useEffect(() => {
    load();
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
      <div style={styles.testBanner}>TEST STOREFRONT — orders placed here don't charge real money or book a real courier.</div>

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
          <ProductCard key={p.id} product={p} onBuyClick={() => setCheckoutProduct(p)} />
        ))}
      </section>

      <footer style={styles.footer}>
        <div style={styles.footerBrand}>
          <Logo height={16} />
        </div>
        <span style={{ fontSize: 12, color: "#8A8578" }}>Powered by saleis.live</span>
      </footer>

      {checkoutProduct ? (
        <CheckoutModal
          product={checkoutProduct}
          brandId={brand.id}
          onClose={() => setCheckoutProduct(null)}
          onOrderComplete={() => {
            setCheckoutProduct(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function ProductCard({ product, onBuyClick }: { product: Product; onBuyClick: () => void }) {
  const pct = discountPercent(product.price, product.salePrice);
  const soldOut = product.stock <= 0;
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
      <button type="button" style={{ ...styles.buyButton, opacity: soldOut ? 0.4 : 1 }} disabled={soldOut} onClick={onBuyClick}>
        {soldOut ? "Sold out" : "Buy now"}
      </button>
    </div>
  );
}

function CheckoutModal({
  product,
  brandId,
  onClose,
  onOrderComplete,
}: {
  product: Product;
  brandId: string;
  onClose: () => void;
  onOrderComplete: () => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("courier");
  const [step, setStep] = useState<"form" | "placing" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setStep("placing");
    setError(null);
    try {
      const order = await apiClient.startCheckout({
        brandId,
        productId: product.id,
        quantity: 1,
        customerName: name.trim(),
        customerLocation: location.trim(),
        deliveryMethod,
      });
      await apiClient.confirmTestPayment(order.id);
      setOrderId(order.id);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the order.");
      setStep("form");
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {step === "done" ? (
          <>
            <h2 style={styles.modalTitle}>Order placed — TEST</h2>
            <p style={styles.modalBody}>
              Order <strong>{orderId}</strong> is now marked "Paid" in the merchant's Orders dashboard. No real payment was taken and no real courier was booked.
            </p>
            <button type="button" style={styles.modalButton} onClick={onOrderComplete}>
              Close
            </button>
          </>
        ) : (
          <>
            <h2 style={styles.modalTitle}>Buy {product.name.value ?? product.sku}</h2>
            <p style={styles.testNotice}>Test checkout — no real payment or courier is involved. This only exercises the real order flow.</p>

            <label style={styles.modalLabel}>Name</label>
            <input style={styles.modalInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />

            <label style={styles.modalLabel}>Delivery location</label>
            <input style={styles.modalInput} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City" />

            <label style={styles.modalLabel}>Delivery method</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                style={{ ...styles.modalToggle, ...(deliveryMethod === "courier" ? styles.modalToggleActive : {}) }}
                onClick={() => setDeliveryMethod("courier")}
              >
                Courier
              </button>
              <button
                type="button"
                style={{ ...styles.modalToggle, ...(deliveryMethod === "pickup" ? styles.modalToggleActive : {}) }}
                onClick={() => setDeliveryMethod("pickup")}
              >
                Pickup
              </button>
            </div>

            {error ? <p style={styles.modalError}>{error}</p> : null}

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button type="button" style={{ ...styles.modalButton, ...styles.modalButtonSecondary }} onClick={onClose}>
                Cancel
              </button>
              <button type="button" style={{ ...styles.modalButton, opacity: step === "placing" ? 0.5 : 1 }} disabled={step === "placing"} onClick={onSubmit}>
                {step === "placing" ? "Placing…" : "Place test order"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
  testBanner: {
    background: colors.navy,
    color: colors.white,
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
    padding: "8px 16px",
    letterSpacing: 0.3,
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
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "24px 32px",
    borderTop: `1px solid ${colors.border}`,
  },
  footerBrand: { display: "flex", alignItems: "center" },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(17,17,17,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 100,
  },
  modalCard: { width: 380, background: colors.white, borderRadius: 16, padding: 28, boxShadow: "0 12px 32px rgba(17,17,17,0.2)" },
  modalTitle: { fontSize: 20, fontWeight: 700, margin: "0 0 8px" },
  modalBody: { fontSize: 13, color: "#5C574C", lineHeight: 1.6, margin: 0 },
  testNotice: { fontSize: 12, color: colors.navy, fontWeight: 600, background: colors.background, borderRadius: 8, padding: "8px 12px", margin: "0 0 16px" },
  modalLabel: { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, marginTop: 12 },
  modalInput: { width: "100%", boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "inherit" },
  modalToggle: { flex: 1, padding: "10px 12px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.white, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  modalToggleActive: { border: `1px solid ${colors.navy}`, color: colors.navy, background: colors.background },
  modalError: { color: "#B3261E", fontSize: 12, marginTop: 12 },
  modalButton: { flex: 1, padding: "12px 16px", borderRadius: 999, border: "none", background: colors.navy, color: colors.white, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  modalButtonSecondary: { background: colors.white, color: colors.ink, border: `1px solid ${colors.border}` },
};
