import { colors, typography } from "@saleis-live/ui";
import { Brand, DeliveryMethod, Money, Order, Product } from "@saleis-live/domain";
import { useEffect, useState } from "react";
import { Logo } from "./components/Logo";
import { apiClient } from "./config/apiClient";

// Flat demo delivery fee — not a real courier rate lookup (no adapter is
// connected, see Launch Studio's honest "Payments/Delivery: Not connected").
const COURIER_FEE_MINOR = 2500;

function formatMoney(m: Money): string {
  return `${m.currency} ${(m.amountMinor / 100).toFixed(0)}`;
}

function discountPercent(price: Money, salePrice: Money): number {
  if (price.amountMinor === 0 || price.amountMinor === salePrice.amountMinor) return 0;
  return Math.round((1 - salePrice.amountMinor / price.amountMinor) * 100);
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

type LoadState = "loading" | "not_found" | "ready";
type CheckoutInfo = { name: string; phone: string; location: string; deliveryMethod: DeliveryMethod };

export function App() {
  const [state, setState] = useState<LoadState>("loading");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutInfo, setCheckoutInfo] = useState<CheckoutInfo>({ name: "", phone: "", location: "", deliveryMethod: "courier" });
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const hash = useHashRoute();

  useEffect(() => {
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
    body = <HomeView brand={brand} products={products} onAddToBag={addToBag} />;
  }

  return (
    <div style={styles.page}>
      <div style={styles.testBanner}>TEST STOREFRONT — orders placed here don't charge real money or book a real courier.</div>
      <header style={styles.header}>
        <a href="#/" style={styles.brandName}>
          {brand.name}
        </a>
        <a href="#/bag" style={styles.bagLink}>
          Bag ({cartCount})
        </a>
      </header>

      {body}

      <footer style={styles.footer}>
        <div style={styles.footerBrand}>
          <Logo height={16} />
        </div>
        <span style={{ fontSize: 12, color: "#8A8578" }}>Powered by saleis.live</span>
      </footer>
    </div>
  );
}

function NotFound() {
  return <p style={{ padding: 32, fontSize: 14 }}>That item isn't available anymore.</p>;
}

function HomeView({ brand, products, onAddToBag }: { brand: Brand; products: Product[]; onAddToBag: (id: string) => void }) {
  const categories = Array.from(new Set(products.map((p) => p.category.value).filter((c): c is string => !!c)));
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const visible = activeCategory ? products.filter((p) => p.category.value === activeCategory) : products;

  return (
    <>
      <section style={styles.hero}>
        <img src={apiClient.resolveAssetUrl("/assets/hero/hero-approved.png")} alt="" style={styles.heroImage} />
        <div style={styles.heroText}>
          <p style={styles.eyebrow}>PRIVATE SALE · LIVE NOW</p>
          <h1 style={styles.h1}>The private sale is live.</h1>
          <p style={styles.heroSub}>Selected pieces. Limited time.</p>
          <a href="#products-grid" style={styles.heroCta}>
            Shop the sale
          </a>
        </div>
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
  return (
    <div style={styles.card}>
      <a href={`#/product/${encodeURIComponent(product.id)}`} style={{ textDecoration: "none", color: "inherit" }}>
        <div style={styles.cardImageWrap}>
          <img src={apiClient.resolveAssetUrl(product.images[0]?.url ?? "")} alt={product.images[0]?.alt ?? ""} style={styles.cardImage} />
        </div>
        <p style={styles.cardName}>{product.name.value}</p>
      </a>
      <p style={styles.cardPriceRow}>
        {pct > 0 ? <span style={styles.cardPriceStrike}>{formatMoney(product.price)}</span> : null}
        <span style={styles.cardPrice}>{formatMoney(product.salePrice)}</span>
        {pct > 0 ? <span style={styles.cardPct}>−{pct}%</span> : null}
      </p>
      <button type="button" style={{ ...styles.buyButton, opacity: soldOut ? 0.4 : 1 }} disabled={soldOut} onClick={onAddToBag}>
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

  return (
    <section style={{ maxWidth: 640, margin: "0 auto", padding: "0 32px 56px" }}>
      <div style={{ ...styles.cardImageWrap, aspectRatio: "1/1", marginBottom: 24 }}>
        <img src={apiClient.resolveAssetUrl(product.images[0]?.url ?? "")} alt={product.images[0]?.alt ?? ""} style={styles.cardImage} />
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
        style={{ ...styles.buyButton, width: "100%", padding: "14px 16px", fontSize: 14, opacity: soldOut ? 0.4 : 1 }}
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

  return (
    <section style={{ maxWidth: 640, margin: "0 auto", padding: "0 32px 56px" }}>
      <h1 style={{ ...styles.h1, fontSize: 26, margin: "32px 0 24px" }}>Your bag</h1>

      {items.length === 0 ? (
        <p style={{ fontSize: 14, color: "#5C574C" }}>
          Your bag is empty. <a href="#/">Continue shopping</a>.
        </p>
      ) : (
        <>
          {items.map(({ product, qty }) => (
            <div key={product.id} style={styles.bagRow}>
              <div style={{ ...styles.cardImageWrap, width: 90, aspectRatio: "1/1", flexShrink: 0 }}>
                <img src={apiClient.resolveAssetUrl(product.images[0]?.url ?? "")} alt="" style={styles.cardImage} />
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

          <a href="#/checkout/delivery" style={{ ...styles.buyButton, display: "block", textAlign: "center", textDecoration: "none", marginTop: 24, padding: "14px 16px" }}>
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

  return (
    <section style={{ maxWidth: 480, margin: "0 auto", padding: "0 32px 56px" }}>
      <h1 style={{ ...styles.h1, fontSize: 26, margin: "32px 0 24px" }}>Delivery or pickup</h1>

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
            style={{ ...styles.buyButton, width: "100%", padding: "14px 16px", fontSize: 14, marginTop: 24, opacity: canContinue ? 1 : 0.4 }}
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
      const order = await apiClient.startCheckout({
        brandId: brand.id,
        items: items.map((i) => ({ productId: i.product.id, quantity: i.qty })),
        customerName: info.name,
        customerPhone: info.phone,
        customerLocation: info.location,
        deliveryMethod: info.deliveryMethod,
      });
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
      <h1 style={{ ...styles.h1, fontSize: 26, margin: "32px 0 16px" }}>Payment</h1>
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
        style={{ ...styles.buyButton, width: "100%", padding: "14px 16px", fontSize: 14, marginTop: 24, opacity: placing ? 0.5 : 1 }}
        disabled={placing}
        onClick={onPay}
      >
        {placing ? "Placing…" : `Pay ${formatMoney({ amountMinor: total, currency })} (TEST)`}
      </button>
    </section>
  );
}

function ConfirmationView({ brand, order }: { brand: Brand; order: Order | null }) {
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

      <a href="#/" style={{ ...styles.buyButton, display: "block", textAlign: "center", textDecoration: "none", marginTop: 24, padding: "14px 16px" }}>
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
  brandName: { fontSize: 18, fontWeight: 700, color: colors.ink, textDecoration: "none" },
  bagLink: { fontSize: 13, fontWeight: 700, color: colors.navy, textDecoration: "none" },

  hero: { position: "relative", minHeight: 420, display: "flex", alignItems: "center", overflow: "hidden", background: colors.background },
  heroImage: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "right center" },
  heroText: { position: "relative", zIndex: 1, padding: "56px 32px", maxWidth: 460 },
  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1, color: colors.ultramarine, margin: "0 0 12px" },
  eyebrowSmall: { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: colors.ultramarine, margin: "0 0 8px" },
  h1: { fontFamily: typography.fontFamily.display, fontSize: 44, margin: "0 0 8px", lineHeight: 1.1 },
  heroSub: { fontSize: 15, color: "#5C574C", margin: "0 0 20px" },
  heroCta: {
    display: "inline-block",
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
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "24px 32px",
    borderTop: `1px solid ${colors.border}`,
  },
  footerBrand: { display: "flex", alignItems: "center" },

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
