import { colors, typography } from "@saleis-live/ui";
import { useEffect, useState } from "react";
import { apiClient } from "./config/apiClient";

const ROOT_DOMAIN = "saleis.live";
const DEMO_TENANT_ID = "t_demo";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function App() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [country, setCountry] = useState("AE");
  const [currency, setCurrency] = useState("AED");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
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
      setCreatedUrl(`https://${brand.slug}.${ROOT_DOMAIN}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (createdUrl) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logoRow}>
            <Asterisk />
            <span style={styles.wordmark}>
              saleis<span style={{ color: colors.ultramarine }}>.live</span>
            </span>
          </div>
          <h1 style={styles.h1}>Your brand workspace is live.</h1>
          <p style={styles.sub}>No support needed — it's ready right now.</p>
          <a href={createdUrl} target="_blank" rel="noreferrer" style={styles.urlPill}>
            {createdUrl}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <Asterisk />
          <span style={styles.wordmark}>
            saleis<span style={{ color: colors.ultramarine }}>.live</span>
          </span>
        </div>
        <h1 style={styles.h1}>Create your brand workspace</h1>
        <p style={styles.sub}>Name your brand, pick your address, and you're live — no developer needed.</p>

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
          <p style={{ ...styles.slugStatus, color: checking ? "#8A8578" : slugAvailable ? "#1B7A3D" : "#B23A2E" }}>
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
    </div>
  );
}

function Asterisk() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      {[0, 60, 120].map((deg) => (
        <rect key={deg} x="10.5" y="2" width="3" height="20" rx="1.5" fill={colors.ink} transform={`rotate(${deg} 12 12)`} />
      ))}
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: colors.background,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: typography.fontFamily.ui,
    color: colors.ink,
  },
  card: { width: 420, background: colors.surface, borderRadius: 16, padding: 32, boxShadow: "0 1px 3px rgba(17,17,17,0.08)" },
  logoRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 24 },
  wordmark: { fontSize: 18, fontWeight: 700 },
  h1: { fontFamily: typography.fontFamily.display, fontSize: 28, margin: "0 0 8px" },
  sub: { fontSize: 14, color: "#5C574C", margin: "0 0 24px", lineHeight: 1.5 },
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
  slugSuffix: { padding: "10px 12px", fontSize: 14, color: "#8A8578", background: colors.background },
  slugStatus: { fontSize: 12, marginTop: 6 },
  row: { display: "flex", gap: 12 },
  error: { color: "#B23A2E", fontSize: 13, marginTop: 12 },
  button: {
    width: "100%",
    marginTop: 24,
    padding: "12px 16px",
    borderRadius: 999,
    border: "none",
    background: colors.ink,
    color: colors.white,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  urlPill: {
    display: "inline-block",
    marginTop: 8,
    padding: "10px 16px",
    borderRadius: 999,
    background: colors.background,
    color: colors.ultramarine,
    textDecoration: "none",
    fontSize: 14,
  },
};
