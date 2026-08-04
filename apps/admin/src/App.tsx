import { colors, typography } from "@saleis-live/ui";
import { ImportBatch, ImportRowDiff, Product } from "@saleis-live/domain";
import { useEffect, useState } from "react";
import { apiClient, resolveStorefrontPreviewUrl } from "./config/apiClient";

const ROOT_DOMAIN = "saleis.live";
const DEMO_TENANT_ID = "t_demo";

/** Matches the left sidebar in the delivered screens (render_screens.py's NAV list) — only Catalogue is wired up so far. */
const NAV_ITEMS = [
  { label: "Dashboard", route: null },
  { label: "Campaigns", route: null },
  { label: "Catalogue", route: "#/import" },
  { label: "AI review", route: null },
  { label: "Orders", route: null },
  { label: "Returns", route: null },
  { label: "Analytics", route: null },
  { label: "Brand & theme", route: null },
  { label: "Settings", route: null },
] as const;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
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

export function App() {
  const hash = useHashRoute();

  if (hash === "#/import") {
    return (
      <AdminShell active="Catalogue">
        <ImportPage />
      </AdminShell>
    );
  }

  // Brand creation is onboarding, before any brand/catalogue exists — the
  // delivered screens all assume a brand is already set up, so there's no
  // sidebar reference for this one; it stays a plain centered card.
  return (
    <div style={styles.onboardingPage}>
      <div style={styles.logoRow}>
        <Logo />
        <span style={styles.wordmark}>
          saleis<span style={{ color: colors.navy }}>.live</span>
        </span>
      </div>
      <CreateBrandPage />
    </div>
  );
}

function AdminShell({ active, children }: { active: (typeof NAV_ITEMS)[number]["label"]; children: React.ReactNode }) {
  return (
    <div style={styles.shellRoot}>
      <div style={styles.topbar}>
        <div style={styles.logoRow}>
          <Logo />
          <span style={styles.wordmark}>
            saleis<span style={{ color: colors.navy }}>.live</span>
          </span>
        </div>
        <a href="#/" style={styles.newBrandLink}>
          + New brand
        </a>
      </div>
      <div style={styles.shellBody}>
        <aside style={styles.sidebar}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.label === active;
            const content = (
              <span style={{ ...styles.navItem, ...(isActive ? styles.navItemActive : {}), ...(item.route ? {} : styles.navItemDisabled) }}>
                {item.label}
                {!item.route ? <span style={styles.soonTag}>Soon</span> : null}
              </span>
            );
            return item.route ? (
              <a key={item.label} href={item.route} style={{ textDecoration: "none" }}>
                {content}
              </a>
            ) : (
              <span key={item.label}>{content}</span>
            );
          })}
        </aside>
        <main style={styles.main}>{children}</main>
      </div>
    </div>
  );
}

function CreateBrandPage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [country, setCountry] = useState("AE");
  const [currency, setCurrency] = useState("AED");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (!slug) {
      setSlugAvailable(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      apiClient
        .isSlugAvailable(slug)
        .then((available) => {
          if (!cancelled) setSlugAvailable(available);
        })
        .catch(() => {
          if (!cancelled) setSlugAvailable(null);
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug]);

  const canSubmit = name.trim().length > 0 && slug.length >= 2 && slugAvailable === true && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const brand = await apiClient.createBrand({ tenantId: DEMO_TENANT_ID, name: name.trim(), slug, country, currency });
      setCreatedUrl(resolveStorefrontPreviewUrl(brand.slug));
      setCreatedSlug(brand.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (createdUrl) {
    return (
      <div style={styles.card}>
        <h1 style={styles.h1}>Your brand workspace is live.</h1>
        <p style={styles.sub}>No support needed — it's ready right now.</p>
        <a href={createdUrl} target="_blank" rel="noreferrer" style={styles.urlPill}>
          Preview your store →
        </a>
        <p style={{ fontSize: 11, color: colors.muted, marginTop: 12 }}>
          Once {createdSlug}.{ROOT_DOMAIN} is connected, your store moves there — same catalogue, same theme.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h1 style={styles.h1}>Launch your own marketplace</h1>
      <p style={styles.sub}>Name your brand, choose your address, and start selling — no developer needed.</p>

      <label style={styles.label}>Brand name</label>
      <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chanel" />

      <label style={styles.label}>Your address</label>
      <div style={styles.slugRow}>
        <input
          style={styles.slugInput}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="chanel"
        />
        <span style={styles.slugSuffix}>.{ROOT_DOMAIN}</span>
      </div>
      {slug ? (
        <p style={{ ...styles.slugStatus, color: checking ? colors.muted : slugAvailable ? colors.success : colors.error }}>
          {checking ? "Checking…" : slugAvailable ? "Available" : "Already taken"}
        </p>
      ) : null}

      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>Country</label>
          <input style={styles.input} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>Currency</label>
          <input style={styles.input} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        </div>
      </div>

      {error ? <p style={styles.error}>{error}</p> : null}

      <button style={{ ...styles.button, opacity: canSubmit ? 1 : 0.4 }} disabled={!canSubmit} onClick={onSubmit}>
        {submitting ? "Creating…" : "Create workspace"}
      </button>
    </div>
  );
}

const ROW_LABELS: Record<string, string> = {
  missing_sku: "No SKU in this row — can't be matched or imported.",
  missing_price: "No price found — required for a new product.",
  missing_stock: "No stock quantity found — required for a new product.",
  invalid_price: "Price column has a value that isn't a number.",
  invalid_stock: "Stock column has a value that isn't a number.",
  missing_image: "No image URL — add one later via photos or an image ZIP.",
  duplicate_sku_in_file: "This SKU appears more than once in the file.",
};

function formatChange(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    const v = value as { amountMinor?: number; currency?: string };
    if (typeof v.amountMinor === "number") return `${(v.amountMinor / 100).toFixed(2)} ${v.currency ?? ""}`.trim();
    return JSON.stringify(value);
  }
  return String(value);
}

function ImportPage() {
  const [brandId, setBrandId] = useState("b_demo");
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);

  const loadProducts = async (id: string) => {
    try {
      setProducts(await apiClient.listBrandProducts(id));
    } catch {
      setProducts(null);
    }
  };

  useEffect(() => {
    loadProducts(brandId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSummary(null);
    try {
      const { batch: staged } = await apiClient.uploadImport(brandId, file);
      setBatch(staged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBatch(null);
    } finally {
      setUploading(false);
    }
  };

  const onCommit = async () => {
    if (!batch) return;
    setCommitting(true);
    setError(null);
    try {
      const result = await apiClient.commitImport(batch.id);
      setBatch(result.batch);
      setSummary(result.summary);
      await loadProducts(brandId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed.");
    } finally {
      setCommitting(false);
    }
  };

  const readyCount = batch?.rows.filter((r) => !r.blocking).length ?? 0;
  const blockingCount = batch?.rows.filter((r) => r.blocking).length ?? 0;

  return (
    <div>
      <p style={styles.eyebrow}>CATALOGUE</p>
      <h1 style={styles.h1}>Import products</h1>
      <p style={styles.sub}>Upload an Excel or CSV file. Nothing changes in your catalogue until you review and commit.</p>

    <div style={styles.sectionCard}>
      <label style={styles.label}>Brand ID</label>
      <div style={styles.row}>
        <input style={{ ...styles.input, flex: 1 }} value={brandId} onChange={(e) => setBrandId(e.target.value)} placeholder="b_demo" />
        <button style={{ ...styles.button, ...styles.buttonSecondary, width: "auto", marginTop: 0, padding: "10px 16px" }} onClick={() => loadProducts(brandId)}>
          Load products
        </button>
      </div>

      <label style={{ ...styles.label, marginTop: 24 }}>File</label>
      <div style={styles.row}>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ flex: 1 }} />
        <button style={{ ...styles.button, width: "auto", marginTop: 0, padding: "10px 16px", opacity: file ? 1 : 0.4 }} disabled={!file || uploading} onClick={onUpload}>
          {uploading ? "Reading…" : "Upload & preview"}
        </button>
      </div>
      <p style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>
        Expected columns (any order, case-insensitive): sku, name, description, category, color, size, material, price, stock, image. Matching is always by SKU — never by name.
      </p>

      {error ? <p style={styles.error}>{error}</p> : null}

      {batch ? (
        <>
          <div style={{ display: "flex", gap: 12, marginTop: 24, marginBottom: 12 }}>
            <span style={{ ...styles.pill, background: colors.bluepale, color: colors.navy }}>{batch.rows.length} rows</span>
            <span style={{ ...styles.pill, background: colors.bluepale, color: colors.success }}>{readyCount} ready</span>
            {blockingCount > 0 ? <span style={{ ...styles.pill, background: colors.pale, color: colors.error }}>{blockingCount} blocked</span> : null}
            <span style={{ ...styles.pill, background: colors.pale, color: colors.ink }}>{batch.status}</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Row</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Changes</th>
                  <th style={styles.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((row: ImportRowDiff) => (
                  <tr key={row.rowNumber}>
                    <td style={styles.td}>{row.rowNumber}</td>
                    <td style={styles.td}>{row.sku || "—"}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.pill,
                          background: row.blocking ? colors.pale : row.action === "add" ? colors.bluepale : colors.pale,
                          color: row.blocking ? colors.error : row.action === "add" ? colors.navy : colors.ink,
                        }}
                      >
                        {row.action}
                      </span>
                    </td>
                    <td style={{ ...styles.td, fontSize: 11 }}>
                      {Object.keys(row.changes).length === 0
                        ? "no changes"
                        : Object.entries(row.changes)
                            .map(([field, c]) => `${field}: ${formatChange(c.from)} → ${formatChange(c.to)}`)
                            .join(", ")}
                    </td>
                    <td style={{ ...styles.td, fontSize: 11, color: row.blocking ? colors.error : colors.muted }}>
                      {row.warnings.map((w) => ROW_LABELS[w] ?? w).join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button style={{ ...styles.button, marginTop: 16, opacity: batch.status === "staged" ? 1 : 0.4, width: 260 }} disabled={batch.status !== "staged" || committing} onClick={onCommit}>
            {committing ? "Committing…" : batch.status === "staged" ? `Commit ${readyCount} rows` : "Committed"}
          </button>
        </>
      ) : null}

      {summary ? (
        <p style={{ ...styles.sub, color: colors.success, fontWeight: 600 }}>
          Done — {summary.created} added, {summary.updated} updated, {summary.skipped} skipped.
        </p>
      ) : null}
    </div>

    <div style={{ ...styles.sectionCard, marginTop: 24 }}>
      <h2 style={{ ...styles.h1, fontSize: 18 }}>Catalogue ({products?.length ?? 0})</h2>
      {products && products.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>SKU</th>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Price</th>
                <th style={styles.th}>Stock</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td style={styles.td}>{p.sku}</td>
                  <td style={styles.td}>{p.name.value ?? "—"}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.pill, background: colors.pale, color: colors.ink }}>{p.status}</span>
                  </td>
                  <td style={styles.td}>{formatChange(p.price)}</td>
                  <td style={styles.td}>{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: colors.muted }}>No products yet for this brand.</p>
      )}
    </div>
    </div>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="-14 -14 28 28">
      <g fill={colors.navy}>
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <rect key={deg} x="-2.1" y="-11.6" width="4.2" height="9.3" rx="2.1" transform={`rotate(${deg})`} />
        ))}
      </g>
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // Onboarding (no brand yet — plain centered card, no sidebar reference exists for this step)
  onboardingPage: {
    minHeight: "100vh",
    background: colors.background,
    fontFamily: typography.fontFamily.ui,
    color: colors.ink,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "48px 24px",
    gap: 32,
  },
  card: { width: 420, background: colors.surface, borderRadius: 16, padding: 32, boxShadow: "0 1px 3px rgba(17,17,17,0.08)", height: "fit-content" },

  // Shell chrome — matches render_screens.py's admin() helper: 70px paper
  // topbar, 232px paper sidebar with a bluepale active pill, ivory content.
  shellRoot: { minHeight: "100vh", background: colors.ivory, fontFamily: typography.fontFamily.ui, color: colors.ink },
  topbar: {
    height: 70,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 28px",
    background: colors.paper,
    borderBottom: `1px solid ${colors.line}`,
  },
  newBrandLink: { fontSize: 12, fontWeight: 700, color: colors.navy, textDecoration: "none" },
  shellBody: { display: "flex", alignItems: "flex-start" },
  sidebar: {
    width: 232,
    flexShrink: 0,
    background: colors.paper,
    borderRight: `1px solid ${colors.line}`,
    minHeight: "calc(100vh - 70px)",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 600,
    color: colors.muted,
  },
  navItemActive: { background: colors.bluepale, color: colors.navy },
  navItemDisabled: { color: colors.stone },
  soonTag: { fontSize: 9, fontWeight: 700, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  main: { flex: 1, padding: "40px 40px 64px", minWidth: 0 },
  eyebrow: { fontSize: 10, fontWeight: 700, color: colors.navy, letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 10px" },
  sectionCard: { background: colors.paper, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 28 },

  logoRow: { display: "flex", alignItems: "center", gap: 8 },
  wordmark: { fontSize: 16, fontWeight: 700 },
  h1: { fontFamily: typography.fontFamily.ui, fontSize: 28, fontWeight: 600, margin: "0 0 8px" },
  sub: { fontSize: 14, color: colors.muted, margin: "0 0 24px", lineHeight: 1.5 },
  label: { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, marginTop: 16 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
  },
  slugRow: { display: "flex", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden" },
  slugInput: { flex: 1, border: "none", padding: "10px 12px", fontSize: 14, fontFamily: "inherit", outline: "none" },
  slugSuffix: { padding: "10px 12px", fontSize: 14, color: colors.muted, background: colors.background },
  slugStatus: { fontSize: 12, marginTop: 6 },
  row: { display: "flex", gap: 12, alignItems: "center" },
  error: { color: colors.error, fontSize: 13, marginTop: 12 },
  button: {
    width: "100%",
    marginTop: 24,
    padding: "12px 16px",
    borderRadius: 999,
    border: "none",
    background: colors.navy,
    color: colors.white,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  buttonSecondary: { background: colors.white, color: colors.ink, border: `1px solid ${colors.border}` },
  urlPill: {
    display: "inline-block",
    marginTop: 8,
    padding: "10px 16px",
    borderRadius: 999,
    background: colors.background,
    color: colors.navy,
    textDecoration: "none",
    fontSize: 14,
  },
  pill: { display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 8 },
  th: { textAlign: "left", fontSize: 11, color: colors.muted, textTransform: "uppercase", padding: "8px 10px", borderBottom: `1px solid ${colors.border}` },
  td: { fontSize: 13, padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" },
};
