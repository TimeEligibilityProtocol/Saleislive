import { colors, typography } from "@saleis-live/ui";
import {
  Brand,
  Campaign,
  CampaignAccess,
  FulfilmentStatus,
  ImportBatch,
  ImportRowDiff,
  IntakeMethod,
  isProductReadyToPublish,
  MatchMethod,
  Order,
  OrderStatus,
  ParsedImportRow,
  PhotoTreatment,
  Product,
  ThemePresetId,
} from "@saleis-live/domain";
import { ApiError, ImportPreview } from "@saleis-live/api-client";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./components/Logo";
import { apiClient, resolveStorefrontPreviewUrl } from "./config/apiClient";

const ROOT_DOMAIN = "saleis.live";
const DEMO_TENANT_ID = "t_demo";

/**
 * The approved final nav — architecture.docx: "Final navigation must stay
 * short: Dashboard / Products / Sales / Orders / Store / Settings." AI
 * Center and Import are deliberately NOT top-level items — they live
 * inside Products, per the doc's own screen consolidation.
 */
const NAV_ITEMS = [
  { label: "Dashboard", route: "#/dashboard" },
  { label: "Products", route: "#/add-stock" },
  { label: "Sales", route: "#/launch-studio" },
  { label: "Orders", route: "#/orders" },
  { label: "Store", route: null },
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

  if (hash === "#/dashboard") {
    return (
      <AdminShell active="Dashboard">
        <DashboardPage />
      </AdminShell>
    );
  }

  if (hash === "#/add-stock") {
    return (
      <AdminShell active="Products">
        <AddStockPage />
      </AdminShell>
    );
  }

  if (hash.startsWith("#/products/")) {
    const productId = decodeURIComponent(hash.slice("#/products/".length));
    return (
      <AdminShell active="Products">
        <ProductStudioPage productId={productId} />
      </AdminShell>
    );
  }

  if (hash === "#/catalogue-center") {
    return (
      <AdminShell active="Products">
        <CatalogueCenterPage />
      </AdminShell>
    );
  }

  if (hash === "#/launch-studio") {
    return (
      <AdminShell active="Sales">
        <LaunchStudioPage />
      </AdminShell>
    );
  }

  if (hash === "#/preview-publish") {
    return (
      <AdminShell active="Sales">
        <PreviewPublishPage />
      </AdminShell>
    );
  }

  if (hash === "#/orders") {
    return (
      <AdminShell active="Orders">
        <OrdersPage />
      </AdminShell>
    );
  }

  if (hash.startsWith("#/orders/")) {
    const orderId = decodeURIComponent(hash.slice("#/orders/".length));
    return (
      <AdminShell active="Orders">
        <OrderDetailPage orderId={orderId} />
      </AdminShell>
    );
  }

  // Mockup 01-brand-setup.png shows this inside the full shell with
  // "Settings" active, not a standalone card — matched exactly here.
  return (
    <AdminShell active="Settings">
      <CreateBrandPage />
    </AdminShell>
  );
}

function AdminShell({ active, children }: { active: (typeof NAV_ITEMS)[number]["label"]; children: React.ReactNode }) {
  return (
    <div style={styles.shellRoot}>
      <div style={styles.topbar}>
        <div style={styles.logoRow}>
          <Logo height={55} />
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

const COUNTRIES = [
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR" },
  { code: "QA", name: "Qatar", currency: "QAR" },
  { code: "KW", name: "Kuwait", currency: "KWD" },
  { code: "BH", name: "Bahrain", currency: "BHD" },
  { code: "OM", name: "Oman", currency: "OMR" },
  { code: "EG", name: "Egypt", currency: "EGP" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "US", name: "United States", currency: "USD" },
] as const;

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "ar", name: "Arabic" },
  { code: "fr", name: "French" },
] as const;

const LAST_BRAND_ID_KEY = "saleislive:lastBrandId";
const LAST_BRAND_SLUG_KEY = "saleislive:lastBrandSlug";

function CreateBrandPage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [countryCode, setCountryCode] = useState<(typeof COUNTRIES)[number]["code"]>("AE");
  const [currency, setCurrency] = useState("AED");
  const [language, setLanguage] = useState("en");
  const [secondaryLanguage, setSecondaryLanguage] = useState("ar");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  // architecture.docx's onboarding-order correction: the CTA lands directly
  // on Add Stock (screen 02), never a dashboard — the brand id is handed
  // off via localStorage so screen 02 knows which brand it's stocking.
  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const brand = await apiClient.createBrand({
        tenantId: DEMO_TENANT_ID,
        name: name.trim(),
        slug,
        country: countryCode,
        currency,
        language,
        secondaryLanguage: secondaryLanguage || null,
      });
      window.localStorage.setItem(LAST_BRAND_ID_KEY, brand.id);
      window.localStorage.setItem(LAST_BRAND_SLUG_KEY, brand.slug);
      window.location.hash = "#/add-stock";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 style={styles.h1}>Create your brand space</h1>
      <p style={styles.sub}>First setup — create the workspace and reserve the storefront address.</p>
      <hr style={styles.divider} />

      <div style={styles.fieldGrid}>
        <div>
          <label style={styles.label}>Brand / store name</label>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maison Noura" />
        </div>
        <div>
          <label style={styles.label}>Country</label>
          <select
            style={styles.input}
            value={countryCode}
            onChange={(e) => {
              const next = COUNTRIES.find((c) => c.code === e.target.value);
              if (!next) return;
              setCountryCode(next.code);
              setCurrency(next.currency);
            }}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={styles.label}>Currency</label>
          <input style={styles.input} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        </div>

        <div>
          <label style={styles.label}>Storefront address</label>
          <div style={styles.slugRow}>
            <input
              style={styles.slugInput}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="maisonnoura"
            />
            <span style={styles.slugSuffix}>.{ROOT_DOMAIN}</span>
          </div>
        </div>
        <div>
          <label style={styles.label}>Primary language</label>
          <select style={styles.input} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={styles.label}>Secondary language</label>
          <select style={styles.input} value={secondaryLanguage} onChange={(e) => setSecondaryLanguage(e.target.value)}>
            <option value="">None</option>
            {LANGUAGES.filter((l) => l.code !== language).map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p style={{ fontSize: 11, color: checking ? colors.muted : slug && slugAvailable === false ? colors.error : colors.muted, marginTop: 8 }}>
        {slug ? (checking ? "Checking…" : slugAvailable ? "Available — checked automatically." : "Already taken.") : "Availability checked automatically."}
      </p>

      <div style={styles.reassuranceCard}>
        <h2 style={styles.reassuranceTitle}>Brand identity can come later</h2>
        <p style={styles.reassuranceBody}>You can add the logo, hero, colours and fonts now or after the stock is processing. The fastest route is to create the space and start uploading your catalogue.</p>
      </div>

      {error ? <p style={styles.error}>{error}</p> : null}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={{ ...styles.button, ...styles.buttonAuto, opacity: canSubmit ? 1 : 0.4 }} disabled={!canSubmit} onClick={onSubmit}>
          {submitting ? "Creating…" : "Create space & continue"}
        </button>
      </div>
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

const INTAKE_TILES: { key: IntakeMethod; title: string; subtitle: string }[] = [
  { key: "excel_csv", title: "Excel / CSV", subtitle: "Product data: SKU, price, sale price, stock and optional attributes." },
  { key: "product_photos", title: "Product photos", subtitle: "Upload a folder or multiple images." },
  { key: "photo_zip", title: "ZIP with photos", subtitle: "Useful for large catalogues." },
  { key: "images_in_spreadsheet", title: "Images are in my spreadsheet", subtitle: "URLs or filenames already reference images." },
  { key: "manual", title: "Add manually", subtitle: "Create or correct a single product." },
  { key: "phone_camera", title: "Phone / camera", subtitle: "Add new stock later from a phone." },
];

const MATCH_METHODS: { key: MatchMethod; label: string }[] = [
  { key: "sku", label: "SKU / variant SKU" },
  { key: "ean", label: "EAN / barcode" },
  { key: "filename", label: "Filename" },
  { key: "ai_suggest", label: "Let AI suggest" },
];

const PHOTO_TREATMENTS: { key: PhotoTreatment; label: string }[] = [
  { key: "use_as_supplied", label: "Use as supplied" },
  { key: "quality_check", label: "Quality check only" },
  { key: "crop_resize", label: "Crop & resize" },
  { key: "remove_background", label: "Remove background" },
  { key: "branded_background", label: "Create branded background" },
];

// Only these two intake methods actually run today (see IntakeMethod's doc
// comment in packages/domain) — everything else in INTAKE_TILES is real UI
// wired to an honest "queued" state, never a fake success.
const REAL_INTAKE_METHODS: IntakeMethod[] = ["excel_csv", "manual"];

// Screen 03's "Saleis.live field" column options — labels the merchant sees
// when pointing a header at a canonical field.
const IMPORT_FIELD_LABELS: Record<keyof ParsedImportRow, string> = {
  sku: "SKU",
  name: "Product name",
  description: "Description",
  category: "Category",
  color: "Colour",
  size: "Size",
  material: "Material",
  price: "Price",
  salePrice: "Sale price",
  currency: "Currency",
  stock: "Stock",
  imageUrl: "Image",
};

function AddStockPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [brandSlug] = useState(() => window.localStorage.getItem(LAST_BRAND_SLUG_KEY));
  // A merchant's stock is rarely one clean source — mockup 02's own copy
  // says "Choose one or several sources," e.g. bulk via Excel plus a
  // manual add for whatever the file didn't cover. Tiles are multi-select.
  const [selectedMethods, setSelectedMethods] = useState<Set<IntakeMethod>>(new Set());
  const [matchMethod, setMatchMethod] = useState<MatchMethod>("sku");
  const [photoTreatment, setPhotoTreatment] = useState<Set<PhotoTreatment>>(new Set());
  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);
  const [queuingOthers, setQueuingOthers] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);

  // Screen 03: file is parsed first so the merchant can confirm/override
  // the column mapping before anything is staged.
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelPreview, setExcelPreview] = useState<ImportPreview | null>(null);
  const [excelFieldByHeader, setExcelFieldByHeader] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState(false);

  const [manualSku, setManualSku] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualStock, setManualStock] = useState("");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualSaved, setManualSaved] = useState<Product | null>(null);

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

  const togglePhotoTreatment = (key: PhotoTreatment) => {
    setPhotoTreatment((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onFilePicked = async (file: File | null) => {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    setBatch(null);
    setSummary(null);
    try {
      const preview = await apiClient.previewImport(file);
      const initial: Record<string, string> = {};
      for (const [field, header] of Object.entries(preview.mapping.fields)) {
        if (header) initial[header] = field;
      }
      setExcelFile(file);
      setExcelPreview(preview);
      setExcelFieldByHeader(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
      setExcelFile(null);
      setExcelPreview(null);
    } finally {
      setPreviewing(false);
    }
  };

  const onConfirmMapping = async () => {
    if (!excelFile) return;
    setUploading(true);
    setError(null);
    setSummary(null);
    try {
      const fieldOverrides = Object.fromEntries(Object.entries(excelFieldByHeader).filter(([, field]) => field)) as Partial<Record<string, keyof ParsedImportRow>>;
      const { batch: staged } = await apiClient.uploadImport(brandId, excelFile, { intakeMethod: "excel_csv", matchMethod, photoTreatment: [...photoTreatment], fieldOverrides });
      setBatch(staged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBatch(null);
    } finally {
      setUploading(false);
    }
  };

  const onPickDifferentFile = () => {
    setExcelFile(null);
    setExcelPreview(null);
    setExcelFieldByHeader({});
    setBatch(null);
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

  const onManualSubmit = async () => {
    if (!manualSku.trim()) return;
    setManualSubmitting(true);
    setError(null);
    try {
      const product = await apiClient.createManualProduct(brandId, {
        sku: manualSku.trim(),
        name: manualName || undefined,
        category: manualCategory || undefined,
        price: manualPrice || undefined,
        stock: manualStock || undefined,
        imageUrl: manualImageUrl || undefined,
      });
      setManualSaved(product);
      setManualSku("");
      setManualName("");
      setManualCategory("");
      setManualPrice("");
      setManualStock("");
      setManualImageUrl("");
      await loadProducts(brandId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that product.");
    } finally {
      setManualSubmitting(false);
    }
  };

  // Non-file tiles still record a real batch each (0 rows, no fake success)
  // so the AI & Catalogue Center has something to read once it exists —
  // see the /api/imports/intent route's doc comment. Several can be
  // selected at once (e.g. "product photos" + "phone/camera"), so this
  // records all of them together in one click.
  const onQueueIntent = async (methods: IntakeMethod[]) => {
    if (methods.length === 0) return;
    setQueuingOthers(true);
    setError(null);
    try {
      const results = await Promise.all(methods.map((m) => apiClient.recordIntakeIntent(brandId, { intakeMethod: m, matchMethod, photoTreatment: [...photoTreatment] })));
      const ids = results.map((r) => r.batch.id).join(", ");
      setQueuedNotice(`Recorded (${ids}) — connects to real processing once the AI & Catalogue Center (screen 04) ships. Nothing was silently added to your catalogue.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record those choices.");
    } finally {
      setQueuingOthers(false);
    }
  };

  const readyCount = batch?.rows.filter((r) => !r.blocking).length ?? 0;
  const blockingCount = batch?.rows.filter((r) => r.blocking).length ?? 0;
  const queuedMethods = [...selectedMethods].filter((m) => !REAL_INTAKE_METHODS.includes(m));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={styles.h1}>Add stock</h1>
          <p style={styles.sub}>Tell saleis.live what you have. Choose one or several sources.</p>
        </div>
        {brandSlug ? (
          <a href={resolveStorefrontPreviewUrl(brandSlug)} target="_blank" rel="noreferrer" style={styles.previewLink}>
            Preview your store →
          </a>
        ) : null}
      </div>
      <hr style={styles.divider} />

      <div style={styles.tileGrid}>
        {INTAKE_TILES.map((tile) => {
          const active = selectedMethods.has(tile.key);
          return (
            <button
              key={tile.key}
              type="button"
              style={{ ...styles.tile, ...(active ? styles.tileActive : {}) }}
              onClick={() => {
                setSelectedMethods((prev) => {
                  const next = new Set(prev);
                  if (next.has(tile.key)) next.delete(tile.key);
                  else next.add(tile.key);
                  return next;
                });
                setQueuedNotice(null);
              }}
            >
              <div style={{ ...styles.tileTitle, ...(active ? { color: colors.navy } : {}) }}>{tile.title}</div>
              <div style={styles.tileSubtitle}>{tile.subtitle}</div>
              {!REAL_INTAKE_METHODS.includes(tile.key) ? <div style={styles.tileTag}>Queues for Catalogue Center</div> : null}
            </button>
          );
        })}
      </div>

      <h2 style={styles.groupLabel}>How should we match photos?</h2>
      <div style={styles.pillRow}>
        {MATCH_METHODS.map((m) => (
          <button key={m.key} type="button" style={{ ...styles.pillButton, ...(matchMethod === m.key ? styles.pillButtonActive : {}) }} onClick={() => setMatchMethod(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      <h2 style={styles.groupLabel}>What should happen to product photos?</h2>
      <div style={styles.pillRow}>
        {PHOTO_TREATMENTS.map((t) => {
          const checked = photoTreatment.has(t.key);
          return (
            <button key={t.key} type="button" style={{ ...styles.pillButton, ...(checked ? styles.pillButtonActive : {}) }} onClick={() => togglePhotoTreatment(t.key)}>
              <span style={{ ...styles.checkbox, ...(checked ? styles.checkboxChecked : {}) }}>{checked ? "✓" : ""}</span>
              {t.label}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>Recorded now, applied by the AI &amp; Catalogue Center once that screen ships — never silently assumed done.</p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          onFilePicked(file);
        }}
      />

      {selectedMethods.has("excel_csv") ? (
        <div style={{ ...styles.sectionCard, marginTop: 24 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 4 }}>Excel / CSV</h2>

          {!excelPreview ? (
            <>
              <p style={{ ...styles.sub, marginBottom: 0 }}>Upload a file — nothing changes in your catalogue until you review and confirm the mapping.</p>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button style={{ ...styles.button, ...styles.buttonAuto, opacity: previewing ? 0.4 : 1 }} disabled={previewing} onClick={() => fileInputRef.current?.click()}>
                  {previewing ? "Reading…" : "Choose file"}
                </button>
              </div>
            </>
          ) : batch ? (
            <>
              <p style={{ ...styles.sub, marginBottom: 0 }}>Mapping confirmed for {excelFile?.name} — review the staged rows below.</p>
              <button type="button" onClick={onPickDifferentFile} style={{ ...styles.previewLink, marginTop: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Start a new import
              </button>
            </>
          ) : (
            <>
              <p style={{ ...styles.sub, marginBottom: 4 }}>
                {excelFile?.name} — {excelPreview.rowCount} rows. Review what each column maps to before we process anything.
              </p>
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Source column</th>
                      <th style={styles.th}>Saleis.live field</th>
                      <th style={styles.th}>Example</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excelPreview.headers.map((header) => {
                      const currentField = excelFieldByHeader[header] ?? "";
                      const autoField = Object.entries(excelPreview.mapping.fields).find(([, h]) => h === header)?.[0];
                      const status = !currentField ? "Unmapped" : currentField === autoField ? "Matched" : "Mapped manually";
                      return (
                        <tr key={header}>
                          <td style={styles.td}>{header}</td>
                          <td style={styles.td}>
                            <select
                              style={{ ...styles.input, padding: "6px 8px", fontSize: 12 }}
                              value={currentField}
                              onChange={(e) => setExcelFieldByHeader((prev) => ({ ...prev, [header]: e.target.value }))}
                            >
                              <option value="">— Ignore —</option>
                              {(Object.entries(IMPORT_FIELD_LABELS) as [keyof ParsedImportRow, string][]).map(([field, label]) => (
                                <option key={field} value={field}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ ...styles.td, fontSize: 11, color: colors.muted }}>{excelPreview.exampleRow[header] || "—"}</td>
                          <td style={styles.td}>
                            <span style={{ ...styles.pill, background: status === "Unmapped" ? colors.pale : colors.bluepale, color: status === "Unmapped" ? colors.muted : colors.navy }}>{status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!Object.values(excelFieldByHeader).includes("sku") ? <p style={{ ...styles.error, marginTop: 12 }}>Map a column to SKU before continuing — it's required to match products.</p> : null}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                <button type="button" onClick={onPickDifferentFile} style={{ ...styles.previewLink, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  Choose a different file
                </button>
                <button
                  style={{ ...styles.button, ...styles.buttonAuto, opacity: uploading || !Object.values(excelFieldByHeader).includes("sku") ? 0.4 : 1 }}
                  disabled={uploading || !Object.values(excelFieldByHeader).includes("sku")}
                  onClick={onConfirmMapping}
                >
                  {uploading ? "Processing…" : "Confirm & process"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {selectedMethods.has("manual") ? (
        <div style={{ ...styles.sectionCard, marginTop: 24 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Add a product</h2>
          <div style={styles.fieldGrid}>
            <div>
              <label style={styles.label}>SKU *</label>
              <input style={styles.input} value={manualSku} onChange={(e) => setManualSku(e.target.value)} placeholder="e.g. MN-001" />
            </div>
            <div>
              <label style={styles.label}>Name</label>
              <input style={styles.input} value={manualName} onChange={(e) => setManualName(e.target.value)} />
            </div>
            <div>
              <label style={styles.label}>Category</label>
              <input style={styles.input} value={manualCategory} onChange={(e) => setManualCategory(e.target.value)} />
            </div>
            <div>
              <label style={styles.label}>Price</label>
              <input style={styles.input} value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="e.g. 460" />
            </div>
            <div>
              <label style={styles.label}>Stock</label>
              <input style={styles.input} value={manualStock} onChange={(e) => setManualStock(e.target.value)} placeholder="e.g. 6" />
            </div>
            <div>
              <label style={styles.label}>Image URL</label>
              <input style={styles.input} value={manualImageUrl} onChange={(e) => setManualImageUrl(e.target.value)} placeholder="optional" />
            </div>
          </div>
          {manualSaved ? <p style={{ ...styles.sub, color: colors.success, fontWeight: 600, marginTop: 16, marginBottom: 0 }}>Saved — {manualSaved.sku} is in your catalogue as a draft.</p> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button style={{ ...styles.button, ...styles.buttonAuto, opacity: manualSubmitting || !manualSku.trim() ? 0.4 : 1 }} disabled={manualSubmitting || !manualSku.trim()} onClick={onManualSubmit}>
              {manualSubmitting ? "Saving…" : "Add product"}
            </button>
          </div>
        </div>
      ) : null}

      {queuedMethods.length > 0 ? (
        <div style={{ ...styles.sectionCard, marginTop: 24 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 4 }}>Other sources selected</h2>
          <p style={{ ...styles.sub, marginBottom: 0 }}>
            {queuedMethods.map((m) => INTAKE_TILES.find((t) => t.key === m)?.title).join(", ")} — not processed automatically yet; recording this so the Catalogue Center picks it up once it ships.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button style={{ ...styles.button, ...styles.buttonAuto, opacity: queuingOthers ? 0.4 : 1 }} disabled={queuingOthers} onClick={() => onQueueIntent(queuedMethods)}>
              {queuingOthers ? "Recording…" : "Record these choices"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p style={styles.error}>{error}</p> : null}

      {queuedNotice ? <p style={{ fontSize: 13, color: colors.navy, fontWeight: 600, marginTop: 16 }}>{queuedNotice}</p> : null}

      {batch ? (
        <div style={{ ...styles.sectionCard, marginTop: 24 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
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
                    <td style={{ ...styles.td, fontSize: 11, color: row.blocking ? colors.error : colors.muted }}>{row.warnings.map((w) => ROW_LABELS[w] ?? w).join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button style={{ ...styles.button, marginTop: 16, opacity: batch.status === "staged" ? 1 : 0.4, width: 260 }} disabled={batch.status !== "staged" || committing} onClick={onCommit}>
            {committing ? "Committing…" : batch.status === "staged" ? `Commit ${readyCount} rows` : "Committed"}
          </button>
        </div>
      ) : null}

      {summary ? (
        <p style={{ ...styles.sub, color: colors.success, fontWeight: 600 }}>
          Done — {summary.created} added, {summary.updated} updated, {summary.skipped} skipped.
        </p>
      ) : null}

      <div style={{ ...styles.sectionCard, marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ ...styles.h1, fontSize: 18, marginBottom: 0 }}>Catalogue ({products?.length ?? 0})</h2>
          <a href="#/catalogue-center" style={styles.previewLink}>
            Review readiness →
          </a>
        </div>
        {products && products.length > 0 ? (
          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Price</th>
                  <th style={styles.th}>Stock</th>
                  <th style={styles.th}></th>
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
                    <td style={styles.td}>
                      <a href={`#/products/${encodeURIComponent(p.id)}`} style={styles.previewLink}>
                        Edit →
                      </a>
                    </td>
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

function ProductStudioPage({ productId }: { productId: string }) {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "approve" | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stock, setStock] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNotConfigured, setAiNotConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    apiClient
      .getProduct(brandId, productId)
      .then((p) => {
        if (cancelled) return;
        setProduct(p);
        setName(p.name.value ?? "");
        setDescription(p.description.value ?? "");
        setCategory(p.category.value ?? "");
        setColor(p.color.value ?? "");
        setMaterial(p.material.value ?? "");
        setPrice((p.price.amountMinor / 100).toString());
        setSalePrice((p.salePrice.amountMinor / 100).toString());
        setStock(String(p.stock));
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, productId]);

  const onSave = async (approve: boolean) => {
    setSaving(approve ? "approve" : "save");
    setError(null);
    setSaved(false);
    try {
      const updated = await apiClient.updateProduct(brandId, productId, {
        name,
        description,
        category,
        color,
        material,
        price: Number(price) || 0,
        salePrice: Number(salePrice) || 0,
        stock: Number(stock) || 0,
        approve,
      });
      setProduct(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <p style={styles.sub}>Loading…</p>;
  if (notFound || !product) return <p style={styles.error}>Product not found.</p>;

  const mainImage = product.images.find((i) => i.isMain) ?? product.images[0];

  const onSuggestWithAI = async () => {
    if (!mainImage) return;
    setAnalyzing(true);
    setError(null);
    setAiNotConfigured(false);
    try {
      const resolvedUrl = mainImage.url.startsWith("http") ? mainImage.url : apiClient.resolveAssetUrl(mainImage.url);
      const suggestion = await apiClient.analyzeProductPhoto(resolvedUrl);
      setColor(suggestion.color);
      setMaterial(suggestion.material);
      setCategory(suggestion.category);
      setDescription(suggestion.description);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) setAiNotConfigured(true);
      else setError(err instanceof Error ? err.message : "AI suggestion failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div>
      <h1 style={styles.h1}>Product Studio</h1>
      <p style={styles.sub}>Edit one product, its images, copy and variants.</p>
      <hr style={styles.divider} />

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ ...styles.sectionCard, width: 260, flexShrink: 0 }}>
          <h2 style={{ ...styles.h1, fontSize: 15, marginBottom: 16 }}>Product media</h2>
          {mainImage ? (
            <img
              src={mainImage.url}
              alt={mainImage.alt}
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, background: colors.background }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: 10,
                background: colors.background,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: colors.muted,
                fontSize: 12,
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              NO PRODUCT IMAGE
            </div>
          )}
          <p style={{ fontSize: 11, color: colors.muted, marginTop: 12 }}>Image tools (background removal, crop, branded backgrounds) arrive with the AI &amp; Catalogue Center.</p>
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={styles.sectionCard}>
            <div style={styles.fieldGrid}>
              <div>
                <label style={styles.label}>Product name</label>
                <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>SKU</label>
                <input style={{ ...styles.input, background: colors.background, color: colors.muted }} value={product.sku} disabled />
              </div>
              <div>
                <label style={styles.label}>Category</label>
                <input style={styles.input} value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>Price</label>
                <input style={styles.input} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>Sale price</label>
                <input style={styles.input} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>Stock</label>
                <input style={styles.input} value={stock} onChange={(e) => setStock(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>Colour</label>
                <input style={styles.input} value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>Material</label>
                <input style={styles.input} value={material} onChange={(e) => setMaterial(e.target.value)} />
              </div>
            </div>

            <div style={{ ...styles.reassuranceCard, marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <h2 style={styles.reassuranceTitle}>AI copy &amp; language</h2>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.buttonAuto, padding: "8px 16px", fontSize: 12, opacity: analyzing || !mainImage ? 0.4 : 1 }}
                  disabled={analyzing || !mainImage}
                  onClick={onSuggestWithAI}
                >
                  {analyzing ? "Analysing…" : "Suggest with AI"}
                </button>
              </div>
              {aiNotConfigured ? (
                <p style={{ ...styles.reassuranceBody, color: colors.error, marginTop: 8 }}>AI isn't configured on this server (missing ANTHROPIC_API_KEY).</p>
              ) : (
                <p style={styles.reassuranceBody}>
                  Reads the product photo and suggests colour, material, category and a description above — review before saving. AR/EN translation isn't wired up yet. Nothing is written until you click Save or Approve.
                </p>
              )}
              <label style={{ ...styles.label, marginTop: 16 }}>Description</label>
              <textarea
                style={{ ...styles.input, minHeight: 80, fontFamily: "inherit", resize: "vertical" }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write or generate a product description…"
              />
            </div>

            {error ? <p style={styles.error}>{error}</p> : null}
            {saved ? <p style={{ ...styles.sub, color: colors.success, fontWeight: 600, marginTop: 12, marginBottom: 0 }}>Saved.</p> : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button
                style={{ ...styles.button, ...styles.buttonAuto, background: colors.white, color: colors.ink, border: `1px solid ${colors.border}`, opacity: saving ? 0.4 : 1 }}
                disabled={!!saving}
                onClick={() => onSave(false)}
              >
                {saving === "save" ? "Saving…" : "Save"}
              </button>
              <button style={{ ...styles.button, ...styles.buttonAuto, opacity: saving ? 0.4 : 1 }} disabled={!!saving} onClick={() => onSave(true)}>
                {saving === "approve" ? "Approving…" : product.status === "active" ? "Approved" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type CatalogueTab = "attention" | "ready" | "all";

/** What's actually missing on this product — plain field checks, not a simulated AI conversation. */
function describeProductIssues(p: Product): string[] {
  const issues: string[] = [];
  if (p.images.length === 0) issues.push("Missing photo");
  if (!p.name.value) issues.push("Missing name");
  if (!p.category.value) issues.push("Missing category");
  if (!p.color.value) issues.push("Missing colour");
  if (!p.material.value) issues.push("Missing material");
  if (p.price.amountMinor <= 0) issues.push("Missing price");
  return issues;
}

/** isProductReadyToPublish (domain) covers publish-blocking fields (price/stock/image/name); this adds catalogue completeness (category/colour/material) for the readiness stat here. */
function isCatalogueReady(p: Product): boolean {
  return isProductReadyToPublish(p) && !!p.category.value && !!p.color.value && !!p.material.value;
}

function CatalogueCenterPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<CatalogueTab>("attention");

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listBrandProducts(brandId)
      .then((p) => {
        if (!cancelled) setProducts(p);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  if (loading) return <p style={styles.sub}>Loading…</p>;

  const all = products ?? [];
  const ready = all.filter(isCatalogueReady);
  const needsAttention = all.filter((p) => !isCatalogueReady(p));
  const missingPhoto = all.filter((p) => p.images.length === 0);
  const rows = tab === "ready" ? ready : tab === "all" ? all : needsAttention;

  return (
    <div>
      <h1 style={styles.h1}>AI &amp; Catalogue Center</h1>
      <p style={styles.sub}>Real readiness, computed from your actual catalogue data.</p>
      <hr style={styles.divider} />

      <div style={styles.tileGrid}>
        <div style={styles.sectionCard}>
          <p style={styles.statLabel}>Ready</p>
          <p style={{ ...styles.statValue, color: colors.success }}>{ready.length}</p>
        </div>
        <div style={styles.sectionCard}>
          <p style={styles.statLabel}>Needs attention</p>
          <p style={{ ...styles.statValue, color: colors.navy }}>{needsAttention.length}</p>
        </div>
        <div style={styles.sectionCard}>
          <p style={styles.statLabel}>Missing photo</p>
          <p style={{ ...styles.statValue, color: colors.error }}>{missingPhoto.length}</p>
        </div>
      </div>

      <div style={styles.pillRow}>
        <button type="button" style={{ ...styles.pillButton, ...(tab === "attention" ? styles.pillButtonActive : {}) }} onClick={() => setTab("attention")}>
          Needs attention ({needsAttention.length})
        </button>
        <button type="button" style={{ ...styles.pillButton, ...(tab === "ready" ? styles.pillButtonActive : {}) }} onClick={() => setTab("ready")}>
          Ready ({ready.length})
        </button>
        <button type="button" style={{ ...styles.pillButton, ...(tab === "all" ? styles.pillButtonActive : {}) }} onClick={() => setTab("all")}>
          All ({all.length})
        </button>
      </div>

      <div style={styles.sectionCard}>
        {rows.length === 0 ? (
          <p style={{ fontSize: 13, color: colors.muted }}>Nothing here.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Issue</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const issues = describeProductIssues(p);
                  return (
                    <tr key={p.id}>
                      <td style={styles.td}>{p.name.value ?? "—"}</td>
                      <td style={styles.td}>{p.sku}</td>
                      <td style={{ ...styles.td, fontSize: 11, color: issues.length ? colors.error : colors.success }}>{issues.length ? issues.join(", ") : "All good"}</td>
                      <td style={styles.td}>
                        <a href={`#/products/${encodeURIComponent(p.id)}`} style={styles.previewLink}>
                          Fix in Product Studio →
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

type LaunchTab = "sale" | "store" | "payments" | "delivery" | "policies";
const LAUNCH_TABS: LaunchTab[] = ["sale", "store", "payments", "delivery", "policies"];

const CAMPAIGN_ACCESS_OPTIONS: { key: CampaignAccess; label: string }[] = [
  { key: "public", label: "Public" },
  { key: "private", label: "Private" },
  { key: "invite", label: "Invite only" },
  { key: "password", label: "Password" },
];

const THEME_PRESET_OPTIONS: { key: ThemePresetId; label: string }[] = [
  { key: "editorial", label: "Editorial" },
  { key: "minimal", label: "Minimal" },
  { key: "high_density", label: "Dense" },
];

function LaunchStudioPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [tab, setTab] = useState<LaunchTab>("sale");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [access, setAccess] = useState<CampaignAccess>("public");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [headline, setHeadline] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [heroDesktopUrl, setHeroDesktopUrl] = useState("");
  const [heroMobileUrl, setHeroMobileUrl] = useState("");
  const [themePreset, setThemePreset] = useState<ThemePresetId>("editorial");

  const [returnPolicy, setReturnPolicy] = useState("");
  const [shippingPolicy, setShippingPolicy] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [productIds, setProductIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.getCurrentCampaign(brandId), apiClient.getBrand(brandId), apiClient.listBrandProducts(brandId)])
      .then(([c, b, p]) => {
        if (cancelled) return;
        setCampaign(c);
        setBrand(b);
        setName(c.name);
        setSlug(c.slug);
        setAccess(c.access);
        setStartsAt(c.startsAt.slice(0, 16));
        setEndsAt(c.endsAt ? c.endsAt.slice(0, 16) : "");
        setHeadline(c.headline);
        setShortDescription(c.shortDescription);
        setHeroDesktopUrl(c.heroDesktopUrl ?? "");
        setHeroMobileUrl(c.heroMobileUrl ?? "");
        setThemePreset(c.themePreset);
        setReturnPolicy(b.returnPolicy ?? "");
        setShippingPolicy(b.shippingPolicy ?? "");
        setProducts(p);
        setProductIds(new Set(c.productIds));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const toggleProduct = (id: string) => {
    setProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSaveSaleAndStore = async () => {
    if (!campaign) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiClient.updateCampaign(campaign.id, {
        name,
        slug,
        access,
        startsAt: startsAt ? new Date(startsAt).toISOString() : campaign.startsAt,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        productIds: [...productIds],
        headline,
        shortDescription,
        heroDesktopUrl: heroDesktopUrl || null,
        heroMobileUrl: heroMobileUrl || null,
        themePreset,
      });
      setCampaign(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const onSavePolicies = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiClient.updateBrandPolicies(brandId, { returnPolicy, shippingPolicy });
      setBrand(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={styles.sub}>Loading…</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={styles.h1}>Launch Studio</h1>
          <p style={styles.sub}>Configure sale, storefront, payment and delivery in one launch workspace.</p>
        </div>
        <a href="#/preview-publish" style={styles.previewLink}>
          Preview &amp; publish →
        </a>
      </div>
      <hr style={styles.divider} />

      <div style={styles.pillRow}>
        {LAUNCH_TABS.map((t) => (
          <button
            key={t}
            type="button"
            style={{ ...styles.pillButton, ...(tab === t ? styles.pillButtonActive : {}) }}
            onClick={() => {
              setTab(t);
              setSaved(false);
              setError(null);
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "sale" ? (
        <div style={{ ...styles.sectionCard, maxWidth: 600 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Sale</h2>
          <label style={styles.label}>Sale name</label>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Private Sale" />
          <label style={styles.label}>Slug</label>
          <input style={styles.input} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. summer-private-sale" />
          <label style={styles.label}>Access</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {CAMPAIGN_ACCESS_OPTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                style={{ ...styles.pillButton, padding: "8px 14px", fontSize: 12, ...(access === a.key ? styles.pillButtonActive : {}) }}
                onClick={() => setAccess(a.key)}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Starts</label>
              <input type="datetime-local" style={styles.input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Ends (optional)</label>
              <input type="datetime-local" style={styles.input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>

          <label style={{ ...styles.label, marginBottom: 8 }}>Products in this sale ({productIds.size})</label>
          {products.length === 0 ? (
            <p style={{ fontSize: 12, color: colors.muted, marginTop: 0 }}>No products in your catalogue yet — add stock first.</p>
          ) : (
            <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${colors.border}`, borderRadius: 8 }}>
              {products.map((p) => {
                const checked = productIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProduct(p.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "8px 12px",
                      background: "none",
                      border: "none",
                      borderBottom: `1px solid ${colors.border}`,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ ...styles.checkbox, ...(checked ? styles.checkboxChecked : {}) }}>{checked ? "✓" : ""}</span>
                    <span style={{ fontSize: 13 }}>{p.name.value ?? p.sku}</span>
                    <span style={{ fontSize: 11, color: colors.muted }}>{p.sku}</span>
                  </button>
                );
              })}
            </div>
          )}

          {error ? <p style={styles.error}>{error}</p> : null}
          {saved ? <p style={{ ...styles.sub, color: colors.success, fontWeight: 600, marginTop: 12, marginBottom: 0 }}>Saved.</p> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button style={{ ...styles.button, ...styles.buttonAuto, opacity: saving ? 0.4 : 1 }} disabled={saving} onClick={onSaveSaleAndStore}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "store" ? (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ ...styles.sectionCard, flex: 1, minWidth: 320 }}>
            <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Store</h2>
            <label style={styles.label}>Headline</label>
            <input style={styles.input} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. The private sale is live." />
            <label style={styles.label}>Short description</label>
            <input style={styles.input} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} placeholder="e.g. Selected pieces. Limited time." />
            <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Desktop hero image URL</label>
                <input style={styles.input} value={heroDesktopUrl} onChange={(e) => setHeroDesktopUrl(e.target.value)} placeholder="optional" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Mobile hero image URL</label>
                <input style={styles.input} value={heroMobileUrl} onChange={(e) => setHeroMobileUrl(e.target.value)} placeholder="optional" />
              </div>
            </div>
            <label style={{ ...styles.label, marginTop: 16 }}>Theme</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {THEME_PRESET_OPTIONS.map((t) => (
                <button key={t.key} type="button" style={{ ...styles.pillButton, ...(themePreset === t.key ? styles.pillButtonActive : {}) }} onClick={() => setThemePreset(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            {error ? <p style={styles.error}>{error}</p> : null}
            {saved ? <p style={{ ...styles.sub, color: colors.success, fontWeight: 600, marginTop: 12, marginBottom: 0 }}>Saved.</p> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button style={{ ...styles.button, ...styles.buttonAuto, opacity: saving ? 0.4 : 1 }} disabled={saving} onClick={onSaveSaleAndStore}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          <div style={{ ...styles.sectionCard, width: 340, flexShrink: 0 }}>
            <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Live preview</h2>
            <div style={{ background: colors.background, borderRadius: 12, padding: 28, textAlign: "center" }}>
              <p style={{ fontFamily: typography.fontFamily.display, fontSize: 26, margin: "0 0 12px", color: colors.ink }}>{headline || "Your headline here"}</p>
              <p style={{ fontSize: 13, color: colors.muted, margin: "0 0 16px" }}>{shortDescription || "Your short description here"}</p>
              <span style={{ ...styles.pill, background: colors.navy, color: colors.white, padding: "8px 20px" }}>Shop now</span>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "payments" ? (
        <div style={styles.sectionCard}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 8 }}>Payments</h2>
          <p style={{ fontSize: 13, color: colors.muted }}>
            Not connected. Saleis.live never holds buyer funds — payments run through your own connected processor (Stripe, Tap, etc.), per the adapter boundary in packages/domain/src/adapters.ts. Wiring up a real
            processor connection is upcoming work, not simulated here.
          </p>
        </div>
      ) : null}

      {tab === "delivery" ? (
        <div style={styles.sectionCard}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 8 }}>Delivery</h2>
          <p style={{ fontSize: 13, color: colors.muted }}>Not connected. Courier booking runs through your own delivery integration once wired up — this is upcoming work, not simulated here.</p>
        </div>
      ) : null}

      {tab === "policies" ? (
        <div style={{ ...styles.sectionCard, maxWidth: 600 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Policies</h2>
          <label style={styles.label}>Return policy</label>
          <textarea
            style={{ ...styles.input, minHeight: 80, fontFamily: "inherit", resize: "vertical" }}
            value={returnPolicy}
            onChange={(e) => setReturnPolicy(e.target.value)}
            placeholder="e.g. Returns accepted within 14 days…"
          />
          <label style={{ ...styles.label, marginTop: 16 }}>Shipping policy</label>
          <textarea
            style={{ ...styles.input, minHeight: 80, fontFamily: "inherit", resize: "vertical" }}
            value={shippingPolicy}
            onChange={(e) => setShippingPolicy(e.target.value)}
            placeholder="e.g. Delivery within 3-5 business days…"
          />
          {error ? <p style={styles.error}>{error}</p> : null}
          {saved ? <p style={{ ...styles.sub, color: colors.success, fontWeight: 600, marginTop: 12, marginBottom: 0 }}>Saved.</p> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button style={{ ...styles.button, ...styles.buttonAuto, opacity: saving ? 0.4 : 1 }} disabled={saving} onClick={onSavePolicies}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreviewPublishPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<"live" | "scheduled" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.getCurrentCampaign(brandId), apiClient.getBrand(brandId), apiClient.listBrandProducts(brandId)])
      .then(([c, b, p]) => {
        if (cancelled) return;
        setCampaign(c);
        setBrand(b);
        setProducts(p);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  if (loading) return <p style={styles.sub}>Loading…</p>;
  if (!campaign || !brand) return <p style={styles.error}>Couldn't load this sale.</p>;

  const selectedProducts = products.filter((p) => campaign.productIds.includes(p.id));
  const readyProducts = selectedProducts.filter(isCatalogueReady);
  const catalogueReady = selectedProducts.length > 0 && readyProducts.length === selectedProducts.length;
  const storeReady = !!campaign.headline && !!campaign.shortDescription;
  const policiesReady = !!brand.returnPolicy && !!brand.shippingPolicy;
  const canPublish = catalogueReady && storeReady && policiesReady;

  const onPublish = async (status: "live" | "scheduled") => {
    if (!campaign) return;
    setPublishing(status);
    setError(null);
    try {
      const updated = await apiClient.updateCampaign(campaign.id, { status });
      setCampaign(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish.");
    } finally {
      setPublishing(null);
    }
  };

  const checklist: { label: string; ready: boolean; note: string }[] = [
    {
      label: "Catalogue",
      ready: catalogueReady,
      note: selectedProducts.length === 0 ? "No products selected" : `${readyProducts.length}/${selectedProducts.length} ready`,
    },
    { label: "Store copy", ready: storeReady, note: storeReady ? "Ready" : "Missing headline or description" },
    { label: "Policies", ready: policiesReady, note: policiesReady ? "Ready" : "Missing return or shipping policy" },
  ];

  return (
    <div>
      <h1 style={styles.h1}>Preview &amp; Publish</h1>
      <p style={styles.sub}>Final check before the sale goes live.</p>
      <hr style={styles.divider} />

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ ...styles.sectionCard, flex: 1, minWidth: 320 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Storefront preview</h2>
          <div style={{ background: colors.background, borderRadius: 12, padding: 28, textAlign: "center" }}>
            <p style={{ fontFamily: typography.fontFamily.display, fontSize: 26, margin: "0 0 12px", color: colors.ink }}>{campaign.headline || "Your headline here"}</p>
            <p style={{ fontSize: 13, color: colors.muted, margin: "0 0 16px" }}>{campaign.shortDescription || "Your short description here"}</p>
            <span style={{ ...styles.pill, background: colors.navy, color: colors.white, padding: "8px 20px" }}>Shop now</span>
          </div>
          <p style={{ fontSize: 12, color: colors.muted, marginTop: 12 }}>
            {selectedProducts.length} product{selectedProducts.length === 1 ? "" : "s"} in this sale.
          </p>
        </div>

        <div style={{ ...styles.sectionCard, width: 320, flexShrink: 0 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Ready to publish</h2>
          {checklist.map((row) => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
              <span style={{ fontSize: 13 }}>{row.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: row.ready ? colors.success : colors.error }}>{row.note}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: 13 }}>Payment</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.muted }}>Not connected</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
            <span style={{ fontSize: 13 }}>Delivery</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.muted }}>Not connected</span>
          </div>

          {!canPublish ? <p style={{ fontSize: 11, color: colors.error, marginTop: 12 }}>Fix the items above before publishing.</p> : null}
          <p style={{ fontSize: 11, color: colors.muted, marginTop: 12 }}>Publishing makes the storefront visible without checkout until a payment processor is connected.</p>
          {error ? <p style={styles.error}>{error}</p> : null}

          {campaign.status === "live" ? (
            <p style={{ ...styles.sub, color: colors.success, fontWeight: 700, marginTop: 16, marginBottom: 0 }}>This sale is live.</p>
          ) : (
            <>
              <button style={{ ...styles.button, opacity: !canPublish || !!publishing ? 0.4 : 1 }} disabled={!canPublish || !!publishing} onClick={() => onPublish("live")}>
                {publishing === "live" ? "Publishing…" : "Publish now"}
              </button>
              <button
                style={{ ...styles.button, background: colors.white, color: colors.ink, border: `1px solid ${colors.border}`, opacity: !canPublish || !!publishing ? 0.4 : 1 }}
                disabled={!canPublish || !!publishing}
                onClick={() => onPublish("scheduled")}
              >
                {publishing === "scheduled" ? "Scheduling…" : "Schedule"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const FULFILMENT_LABELS: Record<FulfilmentStatus, string> = {
  not_started: "Not started",
  ready_to_pack: "Ready to pack",
  packed: "Packed",
  in_transit: "In transit",
  delivered: "Delivered",
};

const PAYMENT_LABELS: Record<OrderStatus, string> = {
  reserved: "Pending",
  paid: "Paid",
  fulfilled: "Paid",
  refunded: "Refunded",
  canceled: "Cancelled",
};

const NEXT_FULFILMENT_LABEL: Record<FulfilmentStatus, string | null> = {
  not_started: "Mark ready to pack",
  ready_to_pack: "Mark packed",
  packed: "Mark shipped",
  in_transit: "Mark delivered",
  delivered: null,
};

function orderIsClosed(order: Order): boolean {
  return order.status === "refunded" || order.status === "canceled";
}

function orderFulfilmentDisplay(order: Order): string {
  return orderIsClosed(order) ? "Cancelled" : FULFILMENT_LABELS[order.fulfilmentStatus];
}

function orderDeliveryDisplay(order: Order): string {
  return orderIsClosed(order) ? "—" : order.deliveryMethod === "courier" ? "Courier" : "Pickup";
}

function orderStatusColor(status: OrderStatus): string {
  if (status === "paid" || status === "fulfilled") return colors.success;
  if (status === "refunded" || status === "canceled") return colors.error;
  return colors.navy;
}

function OrdersPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient.listOrders(brandId).then((o) => {
      if (!cancelled) setOrders(o);
    });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  if (orders === null) return <p style={styles.sub}>Loading…</p>;

  return (
    <div>
      <h1 style={styles.h1}>Orders</h1>
      <p style={styles.sub}>Manage payment and fulfilment separately.</p>
      <hr style={styles.divider} />

      <div style={styles.sectionCard}>
        {orders.length === 0 ? (
          <p style={{ fontSize: 13, color: colors.muted }}>No orders yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Order</th>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Payment</th>
                  <th style={styles.th}>Fulfilment</th>
                  <th style={styles.th}>Delivery</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td style={styles.td}>{o.id}</td>
                    <td style={styles.td}>{o.customerName}</td>
                    <td style={{ ...styles.td, color: orderStatusColor(o.status), fontWeight: 700 }}>{PAYMENT_LABELS[o.status]}</td>
                    <td style={{ ...styles.td, color: orderIsClosed(o) ? colors.error : colors.ink }}>{orderFulfilmentDisplay(o)}</td>
                    <td style={styles.td}>{orderDeliveryDisplay(o)}</td>
                    <td style={styles.td}>{formatChange(o.total)}</td>
                    <td style={styles.td}>
                      <a href={`#/orders/${encodeURIComponent(o.id)}`} style={styles.previewLink}>
                        View →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderDetailPage({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState<"advance" | "refund" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    apiClient
      .getOrder(orderId)
      .then((o) => {
        if (!cancelled) setOrder(o);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) return <p style={styles.sub}>Loading…</p>;
  if (notFound || !order) return <p style={styles.error}>Order not found.</p>;

  const onAdvance = async () => {
    setActing("advance");
    setError(null);
    try {
      setOrder(await apiClient.advanceOrderFulfilment(order.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update fulfilment.");
    } finally {
      setActing(null);
    }
  };

  const onRefund = async () => {
    setActing("refund");
    setError(null);
    try {
      setOrder(await apiClient.refundOrder(order.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't refund.");
    } finally {
      setActing(null);
    }
  };

  const onCancel = async () => {
    setActing("cancel");
    setError(null);
    try {
      setOrder(await apiClient.cancelOrder(order.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel.");
    } finally {
      setActing(null);
    }
  };

  const closed = orderIsClosed(order);
  const nextLabel = NEXT_FULFILMENT_LABEL[order.fulfilmentStatus];
  const canRefund = order.status === "paid" || order.status === "fulfilled";

  return (
    <div>
      <h1 style={styles.h1}>Order {order.id}</h1>
      <p style={styles.sub}>
        {PAYMENT_LABELS[order.status]} • {orderFulfilmentDisplay(order)}
      </p>
      <hr style={styles.divider} />

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ ...styles.sectionCard, flex: 1, minWidth: 320 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Order items</h2>
          {order.lines.map((line, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
              <span style={{ fontSize: 13 }}>
                {line.sku} × {line.quantity}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{formatChange(line.unitPrice)}</span>
            </div>
          ))}

          <h2 style={{ ...styles.h1, fontSize: 16, marginTop: 24, marginBottom: 8 }}>Payment</h2>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: colors.muted }}>{order.paymentAdapterRef ? "Connected merchant account" : "Awaiting payment"}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: orderStatusColor(order.status) }}>{PAYMENT_LABELS[order.status]}</span>
          </div>

          <h2 style={{ ...styles.h1, fontSize: 16, marginTop: 24, marginBottom: 8 }}>Delivery</h2>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: colors.muted }}>{closed ? "—" : order.fulfilmentStatus === "not_started" ? "Not booked yet" : FULFILMENT_LABELS[order.fulfilmentStatus]}</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{order.deliveryMethod === "courier" ? "Courier" : "Pickup"}</span>
          </div>

          <h2 style={{ ...styles.h1, fontSize: 16, marginTop: 24, marginBottom: 8 }}>Customer</h2>
          <p style={{ fontSize: 13, margin: 0 }}>
            {order.customerName} • {order.customerPhone} • {order.customerLocation}
          </p>
        </div>

        <div style={{ ...styles.sectionCard, width: 320, flexShrink: 0 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Timeline</h2>
          {order.timeline.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.navy, width: 60, flexShrink: 0 }}>
                {new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span style={{ fontSize: 13 }}>{t.label}</span>
            </div>
          ))}

          {error ? <p style={styles.error}>{error}</p> : null}

          {!closed && nextLabel ? (
            <button style={{ ...styles.button, opacity: acting ? 0.4 : 1 }} disabled={!!acting} onClick={onAdvance}>
              {acting === "advance" ? "Updating…" : nextLabel}
            </button>
          ) : null}

          {!closed ? (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                style={{
                  ...styles.button,
                  ...styles.buttonAuto,
                  flex: 1,
                  background: colors.white,
                  color: colors.ink,
                  border: `1px solid ${colors.border}`,
                  opacity: acting || !canRefund ? 0.4 : 1,
                }}
                disabled={!!acting || !canRefund}
                onClick={onRefund}
              >
                {acting === "refund" ? "Refunding…" : "Refund"}
              </button>
              <button
                style={{ ...styles.button, ...styles.buttonAuto, flex: 1, background: colors.white, color: colors.error, border: `1px solid ${colors.border}`, opacity: acting ? 0.4 : 1 }}
                disabled={!!acting}
                onClick={onCancel}
              >
                {acting === "cancel" ? "Cancelling…" : "Cancel"}
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: colors.error, fontWeight: 700, marginTop: 12 }}>This order is {order.status}.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function isSameCalendarDay(isoA: string, isoB: string): boolean {
  return isoA.slice(0, 10) === isoB.slice(0, 10);
}

function DashboardPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.getCurrentCampaign(brandId), apiClient.listBrandProducts(brandId), apiClient.listOrders(brandId)])
      .then(([c, p, o]) => {
        if (cancelled) return;
        setCampaign(c);
        setProducts(p);
        setOrders(o);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  if (loading) return <p style={styles.sub}>Loading…</p>;

  const today = new Date().toISOString();
  const ordersToday = orders.filter((o) => isSameCalendarDay(o.createdAt, today));
  const revenueTodayMinor = ordersToday.filter((o) => o.status === "paid" || o.status === "fulfilled").reduce((sum, o) => sum + o.total.amountMinor, 0);
  const revenueCurrency = ordersToday[0]?.total.currency ?? products[0]?.price.currency ?? "AED";
  const needsAttention = products.filter((p) => !isCatalogueReady(p));
  const missingImage = products.filter((p) => p.images.length === 0);
  const ordersNeedingFulfilment = orders.filter((o) => (o.status === "paid" || o.status === "fulfilled") && o.fulfilmentStatus !== "delivered");

  const selectedProducts = campaign ? products.filter((p) => campaign.productIds.includes(p.id)) : [];
  const readyInCampaign = selectedProducts.filter(isCatalogueReady).length;

  const actionQueue: string[] = [
    ordersNeedingFulfilment.length > 0 ? `${ordersNeedingFulfilment.length} order${ordersNeedingFulfilment.length === 1 ? "" : "s"} require fulfilment` : "",
    missingImage.length > 0 ? `${missingImage.length} product${missingImage.length === 1 ? "" : "s"} missing images` : "",
    needsAttention.length > missingImage.length ? `${needsAttention.length} product${needsAttention.length === 1 ? "" : "s"} need catalogue review` : "",
  ].filter(Boolean);

  return (
    <div>
      <h1 style={styles.h1}>Dashboard</h1>
      <p style={styles.sub}>What needs attention today.</p>
      <hr style={styles.divider} />

      <div style={styles.tileGrid}>
        <div style={styles.sectionCard}>
          <p style={styles.statLabel}>Active sales</p>
          <p style={{ ...styles.statValue, color: colors.navy }}>{campaign?.status === "live" ? 1 : 0}</p>
        </div>
        <div style={styles.sectionCard}>
          <p style={styles.statLabel}>Orders today</p>
          <p style={{ ...styles.statValue, color: colors.navy }}>{ordersToday.length}</p>
        </div>
        <div style={styles.sectionCard}>
          <p style={styles.statLabel}>Revenue today</p>
          <p style={{ ...styles.statValue, fontSize: 24, color: colors.navy }}>{(revenueTodayMinor / 100).toFixed(2)} {revenueCurrency}</p>
        </div>
        <div style={styles.sectionCard}>
          <p style={styles.statLabel}>Catalogue alerts</p>
          <p style={{ ...styles.statValue, color: needsAttention.length > 0 ? colors.error : colors.success }}>{needsAttention.length}</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ ...styles.sectionCard, flex: 1, minWidth: 320 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Sales &amp; catalogue</h2>
          {campaign && campaign.name ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{campaign.name}</p>
                <p style={{ fontSize: 12, color: colors.muted, margin: "4px 0 0" }}>
                  {selectedProducts.length} products • {selectedProducts.length > 0 ? Math.round((readyInCampaign / selectedProducts.length) * 100) : 0}% ready
                </p>
              </div>
              <span style={{ ...styles.pill, background: campaign.status === "live" ? colors.bluepale : colors.pale, color: campaign.status === "live" ? colors.navy : colors.muted }}>
                {campaign.status.toUpperCase()}
              </span>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: colors.muted }}>No sale configured yet.</p>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Catalogue</p>
            <a href="#/catalogue-center" style={{ ...styles.previewLink, color: needsAttention.length > 0 ? colors.error : colors.success }}>
              {needsAttention.length > 0 ? `${needsAttention.length} need attention` : "All ready"}
            </a>
          </div>
        </div>

        <div style={{ ...styles.sectionCard, width: 320, flexShrink: 0 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Action queue</h2>
          {actionQueue.length === 0 ? (
            <p style={{ fontSize: 13, color: colors.muted }}>All caught up.</p>
          ) : (
            actionQueue.map((item) => (
              <div key={item} style={{ padding: "10px 0", borderBottom: `1px solid ${colors.border}`, fontSize: 13 }}>
                {item}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
        <a href="#/add-stock" style={{ textDecoration: "none" }}>
          <span style={{ ...styles.button, ...styles.buttonAuto, display: "inline-block" }}>Add stock</span>
        </a>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  sectionCard: { background: colors.paper, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 28 },

  logoRow: { display: "flex", alignItems: "center", gap: 8 },
  h1: { fontFamily: typography.fontFamily.ui, fontSize: 28, fontWeight: 600, margin: "0 0 8px" },
  sub: { fontSize: 14, color: colors.muted, margin: "0 0 8px", lineHeight: 1.5 },
  divider: { border: "none", borderTop: `1px solid ${colors.line}`, margin: "16px 0 28px" },
  label: { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, marginTop: 16 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    background: colors.white,
  },
  fieldGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 },
  slugRow: { display: "flex", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden", background: colors.white },
  slugInput: { flex: 1, border: "none", padding: "10px 12px", fontSize: 14, fontFamily: "inherit", outline: "none" },
  slugSuffix: { padding: "10px 12px", fontSize: 14, color: colors.muted, background: colors.background },
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
  buttonAuto: { width: "auto", marginTop: 0, padding: "12px 28px" },
  pill: { display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 8 },
  th: { textAlign: "left", fontSize: 11, color: colors.muted, textTransform: "uppercase", padding: "8px 10px", borderBottom: `1px solid ${colors.border}` },
  td: { fontSize: 13, padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" },

  // Screen 01's "Brand identity can come later" reassurance card
  reassuranceCard: { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 24, marginTop: 8 },
  reassuranceTitle: { fontSize: 16, fontWeight: 700, margin: "0 0 8px" },
  reassuranceBody: { fontSize: 13, color: colors.muted, lineHeight: 1.6, margin: 0 },

  // Screen 02's 2x3 source-method tiles
  tileGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 32 },
  tile: {
    textAlign: "left",
    background: colors.white,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: "18px 20px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  tileActive: { border: `1px solid ${colors.navy}`, boxShadow: `0 0 0 1px ${colors.navy}` },
  tileTitle: { fontSize: 15, fontWeight: 700, color: colors.ink, marginBottom: 4 },
  tileSubtitle: { fontSize: 12, color: colors.muted, lineHeight: 1.5 },
  tileTag: { fontSize: 10, fontWeight: 700, color: colors.navy, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 10 },

  groupLabel: { fontSize: 15, fontWeight: 700, margin: "0 0 12px" },
  pillRow: { display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 28 },
  pillButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: colors.white,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: "12px 18px",
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  pillButtonActive: { border: `1px solid ${colors.navy}`, color: colors.navy, background: colors.bluepale },
  checkbox: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 16,
    height: 16,
    borderRadius: 4,
    border: `1px solid ${colors.border}`,
    background: colors.white,
    fontSize: 11,
    color: colors.white,
    flexShrink: 0,
  },
  checkboxChecked: { background: colors.navy, border: `1px solid ${colors.navy}` },

  previewLink: { fontSize: 13, fontWeight: 700, color: colors.navy, textDecoration: "none", whiteSpace: "nowrap", marginTop: 4 },
  statLabel: { fontSize: 12, fontWeight: 700, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 8px" },
  statValue: { fontSize: 32, fontWeight: 700, margin: 0 },
};
