import { colors, typography } from "@saleis-live/ui";
import {
  Brand,
  BrandMembership,
  Campaign,
  CampaignAccess,
  FulfilmentStatus,
  HttpIntegrationConfig,
  APPROVED_FONTS,
  HERO_COLOR_PRESETS,
  HeroColorPresetId,
  ImportBatch,
  ImportRowDiff,
  isCatalogueReady,
  Order,
  OrderStatus,
  ParsedImportRow,
  Product,
  Role,
  ThemePresetId,
  User,
} from "@saleis-live/domain";
import { ApiError, BackgroundPresetMeta, ImportPreview, SetupStepKey, SetupStepView, TeamMemberView } from "@saleis-live/api-client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Logo } from "./components/Logo";
import { apiClient, AUTH_TOKEN_KEY, resolveCatalogueExportUrl, resolveStorefrontPreviewUrl } from "./config/apiClient";

const ROOT_DOMAIN = "saleis.live";

/**
 * The approved final nav — architecture.docx: "Final navigation must stay
 * short: Dashboard / Products / Sales / Orders / Store / Settings." AI
 * Center and Import are deliberately NOT top-level items — they live
 * inside Products, per the doc's own screen consolidation.
 */
/**
 * Ola's explicit sequence — each step of the process is its own tab, in
 * the order the process actually happens: shop, team, stock, catalogue,
 * sale, publish. Dashboard moves to the very end — it only has real
 * numbers to show once you've gone through the process, so it doesn't
 * belong near the start. Orders sits with it, since both are ongoing
 * operations rather than one-time setup steps.
 */
const NAV_ITEMS = [
  { label: "New brand", route: "#/shop" },
  { label: "Team", route: "#/team" },
  { label: "Add your stock", route: "#/add-stock" },
  { label: "Review your products with AI", route: "#/catalogue-center" },
  { label: "Set up your sale", route: "#/launch-studio" },
  { label: "Payments & delivery", route: "#/payments-delivery" },
  { label: "Go live", route: "#/preview-publish" },
  { label: "Orders", route: "#/orders" },
  { label: "Dashboard", route: "#/dashboard" },
  { label: "Store", route: null },
] as const;

type NavLabel = (typeof NAV_ITEMS)[number]["label"];

/**
 * docs/product/saleis-live-roles-permissions-v1.md's role → permission
 * matrix, collapsed to "which top-level nav areas can this role open at
 * all" — the row-by-row edit/view distinction inside each area isn't
 * enforced yet (see the read_only gap noted where this is used).
 */
const ROLE_NAV_ACCESS: Record<Role, NavLabel[]> = {
  group_owner: ["New brand", "Team", "Add your stock", "Review your products with AI", "Set up your sale", "Payments & delivery", "Go live", "Orders", "Dashboard", "Store"],
  brand_admin: ["New brand", "Team", "Add your stock", "Review your products with AI", "Set up your sale", "Payments & delivery", "Go live", "Orders", "Dashboard", "Store"],
  merchandiser: ["Add your stock", "Review your products with AI", "Set up your sale", "Payments & delivery", "Go live"],
  order_manager: ["Orders"],
  analyst: ["Dashboard"],
  read_only: ["New brand", "Team", "Add your stock", "Review your products with AI", "Set up your sale", "Payments & delivery", "Go live", "Orders", "Dashboard", "Store"],
};

/** Where each wizard step's real work happens — used both to link the setup bar's step label and to redirect someone who jumps ahead to a step that isn't unlocked yet. */
const SETUP_STEP_ROUTES: Record<SetupStepKey, string> = {
  brand_setup: "#/shop",
  stock_intake: "#/add-stock",
  ai_catalogue_review: "#/catalogue-center",
  launch_setup: "#/launch-studio",
  preview_publish: "#/preview-publish",
};

function firstAccessibleRoute(role: Role | null): string | null {
  if (!role) return null;
  const allowed = ROLE_NAV_ACCESS[role];
  return NAV_ITEMS.find((item) => item.route && allowed.includes(item.label))?.route ?? null;
}

/** Shared by the setup bar and the route guard below so both agree on the same fetch, not two independent ones. */
function useSetupSteps(brandId: string) {
  const [steps, setSteps] = useState<SetupStepView[] | null>(null);
  const reload = useCallback(() => {
    apiClient
      .listSetupSteps(brandId)
      .then(setSteps)
      .catch(() => setSteps(null));
  }, [brandId]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { steps, reload };
}

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

interface AuthState {
  loading: boolean;
  user: User | null;
  memberships: BrandMembership[];
  login: (email: string, password: string) => Promise<void>;
  signup: (input: { email: string; password: string; displayName: string; brand: { name: string; slug: string; country: string; currency: string; language: string; secondaryLanguage: string | null } }) => Promise<void>;
  logout: () => void;
}

/**
 * Session lives in localStorage as a bearer token — apiClient.getAuthToken
 * (config/apiClient.ts) reads the same key, so every request everywhere
 * already carries it once this resolves. On mount, a stored token is
 * revalidated against /api/auth/me rather than trusted blindly, since it
 * may have expired or been revoked server-side since the last visit.
 */
function useAuth(): AuthState {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<BrandMembership[]>([]);

  useEffect(() => {
    let cancelled = false;
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    apiClient
      .me()
      .then((res) => {
        if (cancelled) return;
        setUser(res.user);
        setMemberships(res.memberships);
      })
      .catch(() => {
        if (!cancelled) window.localStorage.removeItem(AUTH_TOKEN_KEY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient.login(email, password);
    window.localStorage.setItem(AUTH_TOKEN_KEY, res.token);
    setUser(res.user);
    const me = await apiClient.me();
    setMemberships(me.memberships);
  };

  const signup: AuthState["signup"] = async (input) => {
    const res = await apiClient.signup(input);
    window.localStorage.setItem(AUTH_TOKEN_KEY, res.token);
    // Without this, AppRoutes' brandId falls back to "b_demo" (its default
    // when nothing is stored yet) and a brand-new customer would land
    // straight in Demo Brand's data instead of the one they just created.
    window.localStorage.setItem(LAST_BRAND_ID_KEY, res.brand.id);
    window.localStorage.setItem(LAST_BRAND_SLUG_KEY, res.brand.slug);
    setUser(res.user);
    const me = await apiClient.me();
    setMemberships(me.memberships);
  };

  const logout = () => {
    apiClient.logout().catch(() => {});
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
    setMemberships([]);
  };

  return { loading, user, memberships, login, signup, logout };
}

const AuthContext = createContext<AuthState | null>(null);

/** AdminShell (and anything else deep in the tree that needs who's logged in / what role they hold) reads this instead of threading auth through every page component's props. */
function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthContext.Provider");
  return ctx;
}

/** Any of these, typed in the one-field quick-sign-in box, logs straight into the demo group_owner account — see DEMO_OWNER_EMAIL/PASSWORD in apps/api/src/store/users.ts. */
const QUICK_SIGNIN_NAMES = ["ola", "admin"];

/**
 * Two logins in one screen: a single "just type your name" field for Ola
 * demoing this to people (her request — as frictionless as possible, no
 * visible password), and underneath it, unchanged, the real email+password
 * login real teammate accounts still need. The quick field never bypasses
 * the backend's password check — it just silently supplies the known demo
 * password, so a real teammate's login stays exactly as protected as
 * before.
 */
function LoginPage({ onLogin, onCreateAccount }: { onLogin: (email: string, password: string) => Promise<void>; onCreateAccount: () => void }) {
  const [quickName, setQuickName] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [showFullLogin, setShowFullLogin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError(null);
    if (!QUICK_SIGNIN_NAMES.includes(quickName.trim().toLowerCase())) {
      setQuickError("Don't recognise that name — use email sign-in below.");
      return;
    }
    setQuickSubmitting(true);
    try {
      await onLogin("admin", "ready");
    } catch (err) {
      setQuickError(err instanceof ApiError && err.status === 429 ? "Too many attempts — wait a few minutes and try again." : "Couldn't sign in.");
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError("Too many attempts — wait a few minutes and try again.");
      else setError("Wrong email or password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.loginRoot}>
      <div style={styles.loginCard}>
        <Logo height={40} />
        <h1 style={{ ...styles.h1, fontSize: 22, marginTop: 24 }}>Sign in</h1>

        {!showFullLogin ? (
          <form onSubmit={(e) => void handleQuickSubmit(e)}>
            <label style={styles.label} htmlFor="quick-name">
              Your name
            </label>
            <input id="quick-name" type="text" autoFocus required value={quickName} onChange={(e) => setQuickName(e.target.value)} style={styles.input} placeholder="Ola" />
            {quickError ? <p style={{ color: colors.error, fontSize: 13, marginTop: 12 }}>{quickError}</p> : null}
            <button type="submit" disabled={quickSubmitting} style={{ ...styles.button, marginTop: 24, width: "100%" }}>
              {quickSubmitting ? "Signing in…" : "Sign in"}
            </button>
            <button type="button" onClick={() => setShowFullLogin(true)} style={{ ...styles.linkButton, fontSize: 12, marginTop: 16, display: "block" }}>
              Sign in with email instead
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <label style={styles.label} htmlFor="login-email">
              Email or username
            </label>
            {/* type="text", not "email" — the demo login is a plain username ("admin"), and native email-format
                validation would silently block submitting anything that isn't a real address. */}
            <input id="login-email" type="text" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} />
            <label style={styles.label} htmlFor="login-password">
              Password
            </label>
            <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} />
            {error ? <p style={{ color: colors.error, fontSize: 13, marginTop: 12 }}>{error}</p> : null}
            <button type="submit" disabled={submitting} style={{ ...styles.button, marginTop: 24, width: "100%" }}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
            <button type="button" onClick={() => setShowFullLogin(false)} style={{ ...styles.linkButton, fontSize: 12, marginTop: 16, display: "block" }}>
              Back to quick sign-in
            </button>
          </form>
        )}
        <hr style={{ ...styles.divider, margin: "20px 0" }} />
        <p style={{ fontSize: 13, color: colors.muted, textAlign: "center", margin: 0 }}>
          New here?{" "}
          <button type="button" onClick={onCreateAccount} style={{ ...styles.linkButton, fontSize: 13, fontWeight: 700 }}>
            Create an account
          </button>
        </p>
      </div>
    </div>
  );
}

/**
 * The real front door for a brand-new customer — everyone before this was
 * either the seeded demo account or someone an existing admin invited (see
 * /api/auth/invite). Account + first brand in one screen, deliberately not
 * split into two steps: they're a single decision ("I'm starting my own
 * store on saleis.live"), not two.
 */
function SignUpPage({ onSignup, onBackToLogin }: { onSignup: AuthState["signup"]; onBackToLogin: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [brandName, setBrandName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [countryCode, setCountryCode] = useState<(typeof COUNTRIES)[number]["code"]>("AE");
  const [currency, setCurrency] = useState("AED");
  const [language, setLanguage] = useState("en");
  const [secondaryLanguage, setSecondaryLanguage] = useState("ar");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(brandName));
  }, [brandName, slugTouched]);

  useEffect(() => {
    if (!slug) {
      setSlugAvailable(null);
      return;
    }
    let cancelled = false;
    setCheckingSlug(true);
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
          if (!cancelled) setCheckingSlug(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug]);

  const canSubmit = displayName.trim().length > 0 && email.trim().length > 0 && password.length >= 8 && brandName.trim().length > 0 && slug.length >= 2 && slugAvailable === true && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSignup({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        brand: { name: brandName.trim(), slug, country: countryCode, currency, language, secondaryLanguage: secondaryLanguage || null },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(err.message.includes("slug") ? "That storefront address was just taken — pick another." : "That email already has an account — sign in instead.");
      else setError(err instanceof Error ? err.message : "Couldn't create your account.");
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.loginRoot}>
      <div style={{ ...styles.loginCard, maxWidth: 420 }}>
        <Logo height={40} />
        <h1 style={{ ...styles.h1, fontSize: 22, marginTop: 24 }}>Create your account</h1>
        <p style={{ ...styles.sub, marginTop: 4 }}>Your account and your first store, in one step.</p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <label style={styles.label} htmlFor="signup-name">
            Your name
          </label>
          <input id="signup-name" type="text" autoFocus required value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={styles.input} />

          <label style={styles.label} htmlFor="signup-email">
            Email
          </label>
          <input id="signup-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} />

          <label style={styles.label} htmlFor="signup-password">
            Password
          </label>
          <input id="signup-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} placeholder="At least 8 characters" />

          <hr style={{ ...styles.divider, margin: "16px 0" }} />

          <label style={styles.label} htmlFor="signup-brand-name">
            Store name
          </label>
          <input id="signup-brand-name" type="text" required value={brandName} onChange={(e) => setBrandName(e.target.value)} style={styles.input} placeholder="e.g. Olenka's Closet" />

          <label style={styles.label} htmlFor="signup-slug">
            Storefront address
          </label>
          <input
            id="signup-slug"
            type="text"
            required
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value));
              setSlugTouched(true);
            }}
            style={styles.input}
          />
          {slug ? (
            <p style={{ fontSize: 12, marginTop: 4, color: checkingSlug ? colors.muted : slugAvailable ? colors.success : colors.error }}>
              {checkingSlug ? "Checking…" : slugAvailable ? `${slug}.${ROOT_DOMAIN} is available` : "That address is taken"}
            </p>
          ) : null}

          <div style={styles.fieldGrid}>
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

          {error ? <p style={{ color: colors.error, fontSize: 13, marginTop: 12 }}>{error}</p> : null}
          <button type="submit" disabled={!canSubmit} style={{ ...styles.button, marginTop: 24, width: "100%", opacity: canSubmit ? 1 : 0.5 }}>
            {submitting ? "Creating your account…" : "Create account and start"}
          </button>
          <button type="button" onClick={onBackToLogin} style={{ ...styles.linkButton, fontSize: 12, marginTop: 16, display: "block", textAlign: "center", width: "100%" }}>
            Already have an account? Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

export function App() {
  const hash = useHashRoute();
  const auth = useAuth();
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  if (auth.loading) {
    return <div style={styles.loginRoot} />;
  }

  if (!auth.user) {
    return authMode === "signup" ? (
      <SignUpPage onSignup={auth.signup} onBackToLogin={() => setAuthMode("login")} />
    ) : (
      <LoginPage onLogin={auth.login} onCreateAccount={() => setAuthMode("signup")} />
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      <AppRoutes hash={hash} />
    </AuthContext.Provider>
  );
}

/**
 * Resolves a hash to what it needs for gating: which nav area it belongs
 * to (role check) and which wizard step it belongs to, if any (lock
 * check) — kept separate from rendering so the guard below can run before
 * committing to a page.
 */
function resolveRoute(hash: string): { active: NavLabel; stepKey: SetupStepKey | null; page: React.ReactNode } {
  if (hash === "#/dashboard") return { active: "Dashboard", stepKey: null, page: <DashboardPage /> };
  if (hash === "#/add-stock") return { active: "Add your stock", stepKey: "stock_intake", page: <AddStockPage /> };
  if (hash.startsWith("#/products/")) {
    const productId = decodeURIComponent(hash.slice("#/products/".length));
    return { active: "Review your products with AI", stepKey: "ai_catalogue_review", page: <ProductStudioPage productId={productId} /> };
  }
  if (hash === "#/catalogue-center") return { active: "Review your products with AI", stepKey: "ai_catalogue_review", page: <CatalogueCenterPage /> };
  if (hash === "#/launch-studio") return { active: "Set up your sale", stepKey: "launch_setup", page: <LaunchStudioPage /> };
  // Same wizard step as Launch Studio (launch_setup) — a separate nav
  // destination visually, not a separate approval gate, per Ola's ask
  // (2026-08-12) to pull Payments/Delivery/Policies out of Launch
  // Studio's tabs into their own sidebar screen before Go live.
  if (hash === "#/payments-delivery") return { active: "Payments & delivery", stepKey: "launch_setup", page: <PaymentsDeliveryPage /> };
  if (hash === "#/preview-publish") return { active: "Go live", stepKey: "preview_publish", page: <PreviewPublishPage /> };
  if (hash === "#/orders") return { active: "Orders", stepKey: null, page: <OrdersPage /> };
  if (hash.startsWith("#/orders/")) {
    const orderId = decodeURIComponent(hash.slice("#/orders/".length));
    return { active: "Orders", stepKey: null, page: <OrderDetailPage orderId={orderId} /> };
  }
  if (hash === "#/team") return { active: "Team", stepKey: null, page: <TeamPage /> };
  if (hash === "#/shop") return { active: "New brand", stepKey: "brand_setup", page: <ShopSetupPage /> };
  // Unmatched hash (the bare "#/" a fresh login with no brand yet resolves
  // to) lands on the same shop-setup page.
  return { active: "New brand", stepKey: "brand_setup", page: <ShopSetupPage /> };
}

/**
 * Two gates run on every navigation, in this order: (1) does this role
 * even open this nav area at all — docs/product/saleis-live-roles-permissions-v1.md's
 * matrix, e.g. a Merchandiser never sees Dashboard or Orders; (2) for
 * pages tied to a wizard step, is that step actually unlocked yet — so
 * jumping straight to Launch Setup before Stock Intake is approved bounces
 * back to whichever step is actually current. Redirects, rather than an
 * error page, so a restricted nav item behaves as if it simply isn't there
 * — matching "those menu items simply aren't shown to them" in the doc.
 */
function AppRoutes({ hash }: { hash: string }) {
  const auth = useAuthContext();
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const role = auth.memberships.find((m) => m.brandId === brandId)?.role ?? null;
  const { steps } = useSetupSteps(brandId);

  const resolved = resolveRoute(hash);
  const hasBrandAccess = role !== null;
  const roleBlocked = hasBrandAccess && !ROLE_NAV_ACCESS[role].includes(resolved.active);
  const stepView = resolved.stepKey && steps ? (steps.find((s) => s.stepKey === resolved.stepKey) ?? null) : null;
  const stepLocked = !!stepView && !stepView.unlocked;
  const fallback = firstAccessibleRoute(role);

  useEffect(() => {
    if (roleBlocked && fallback && hash !== fallback) {
      window.location.hash = fallback;
    } else if (stepLocked && steps) {
      const currentKey = steps.find((s) => s.status !== "approved")?.stepKey ?? "brand_setup";
      const target = SETUP_STEP_ROUTES[currentKey];
      if (hash !== target) window.location.hash = target;
    }
  }, [hash, roleBlocked, stepLocked, fallback, steps]);

  if (!hasBrandAccess) {
    return (
      <AdminShell active={resolved.active}>
        <p style={styles.sub}>You don't have access to this brand.</p>
      </AdminShell>
    );
  }
  if (roleBlocked || stepLocked) return null;

  return <AdminShell active={resolved.active}>{resolved.page}</AdminShell>;
}

/** Plain language for what's actually happening at each step, not internal screen/tab names — Ola's explicit correction. */
const SETUP_STEP_LABELS: Record<SetupStepKey, string> = {
  brand_setup: "Set up your shop",
  stock_intake: "Add your stock",
  ai_catalogue_review: "Review your products with AI",
  launch_setup: "Set up your sale",
  preview_publish: "Go live",
};

const SETUP_STEP_ORDER: SetupStepKey[] = ["brand_setup", "stock_intake", "ai_catalogue_review", "launch_setup", "preview_publish"];

/**
 * A "Next step →" button on the page itself, not just the top bar — Ola's
 * request: every screen in the process should have one. Solo operator (the
 * common case so far): if the signed-in person can approve, clicking Next
 * submits AND approves in one motion, then moves on — no separate trip to
 * the bar. A real teammate who can't approve their own step just submits
 * and waits; Next stays disabled until someone else signs off.
 */
function WizardNextButton({ stepKey }: { stepKey: SetupStepKey }) {
  const auth = useAuthContext();
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const { steps, reload } = useSetupSteps(brandId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = auth.memberships.find((m) => m.brandId === brandId)?.role ?? null;
  const canApprove = role === "brand_admin" || role === "group_owner";
  const step = steps?.find((s) => s.stepKey === stepKey);
  if (!step) return null;

  const idx = SETUP_STEP_ORDER.indexOf(stepKey);
  const nextKey = SETUP_STEP_ORDER[idx + 1];
  const isLast = !nextKey;

  if (isLast && step.status === "approved") {
    return (
      <div style={styles.wizardNextRow}>
        <span style={{ fontSize: 13, color: colors.success, fontWeight: 600 }}>✓ Setup complete</span>
      </div>
    );
  }

  const goNext = () => {
    if (nextKey) window.location.hash = SETUP_STEP_ROUTES[nextKey];
  };

  const waitingForOthers = step.status === "submitted" && !canApprove;

  const handleClick = async () => {
    if (step.status === "approved") {
      goNext();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.submitSetupStep(brandId, stepKey);
      if (canApprove) await apiClient.approveSetupStep(brandId, stepKey);
      reload();
      if (canApprove) goNext();
    } catch {
      setError("Couldn't continue — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.wizardNextRow}>
      <button type="button" disabled={busy || waitingForOthers} style={{ ...styles.button, ...styles.buttonAuto, opacity: waitingForOthers ? 0.5 : 1 }} onClick={() => void handleClick()}>
        {waitingForOthers ? "Waiting for approval" : isLast ? "Finish setup" : "Next step →"}
      </button>
      {error ? <span style={{ color: colors.error, fontSize: 13 }}>{error}</span> : null}
    </div>
  );
}

/**
 * Thin bar, dots + current-step label side by side — persistent on every
 * admin page, not a block in the middle of one page. Ola confirmed the
 * dots version was right; what needed fixing was just the step labels
 * (now the real screen names, see SETUP_STEP_LABELS) and the "Team" nav
 * item's name/position. Hides itself once all 5 steps are approved.
 */
function SetupProgressBar() {
  const auth = useAuthContext();
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const { steps, reload } = useSetupSteps(brandId);
  const [busy, setBusy] = useState(false);
  const [teamSize, setTeamSize] = useState<number | null>(null);
  const autoApprovingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listTeam(brandId)
      .then((team) => {
        if (!cancelled) setTeamSize(team.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const role = auth.memberships.find((m) => m.brandId === brandId)?.role ?? null;
  const canApprove = role === "brand_admin" || role === "group_owner";
  const currentIndex = steps ? steps.findIndex((s) => s.status !== "approved") : -1;
  const current = currentIndex >= 0 ? steps![currentIndex] : null;
  // A solo brand has no one else who could ever approve a step they submitted — the
  // gate is pointless friction (Ola, 2026-08-12: got confused by an Approve/Reject
  // bar with no other team member around to explain it). Approve it silently instead.
  const isSolo = teamSize !== null && teamSize <= 1;

  useEffect(() => {
    if (isSolo && canApprove && current?.status === "submitted" && !autoApprovingRef.current) {
      autoApprovingRef.current = true;
      apiClient
        .approveSetupStep(brandId, current.stepKey)
        .catch(() => {})
        .finally(() => {
          autoApprovingRef.current = false;
          reload();
        });
    }
  }, [isSolo, canApprove, current?.status, current?.stepKey, brandId, reload]);

  if (!steps || !current) return null;

  const act = async (fn: () => Promise<SetupStepView>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      // fall through to reload() — it re-fetches the real state either way
    } finally {
      reload();
      setBusy(false);
    }
  };

  const handleReject = () => {
    const note = window.prompt(`Why is "${SETUP_STEP_LABELS[current.stepKey]}" being rejected?`)?.trim();
    if (!note) return;
    void act(() => apiClient.rejectSetupStep(brandId, current.stepKey, note));
  };

  return (
    <div className="admin-setup-bar" style={styles.setupBar}>
      <div style={styles.setupBarDots}>
        {steps.map((s, i) => (
          <span
            key={s.stepKey}
            title={SETUP_STEP_LABELS[s.stepKey]}
            style={{ ...styles.setupDot, ...(s.status === "approved" ? styles.setupDotDone : i === currentIndex ? styles.setupDotCurrent : {}) }}
          />
        ))}
      </div>
      <div style={styles.setupBarText}>
        <strong>Setup {currentIndex}/5</strong>
        <span style={{ color: colors.muted }}> · </span>
        <a href={SETUP_STEP_ROUTES[current.stepKey]} style={{ color: colors.navy, fontWeight: 600 }}>
          {SETUP_STEP_LABELS[current.stepKey]}
        </a>
        {current.status === "submitted" && !isSolo ? <span style={{ color: colors.warning }}> · waiting for approval</span> : null}
        {current.status === "rejected" && current.note ? <span style={{ color: colors.error }}> · rejected: {current.note}</span> : null}
      </div>
      <div style={styles.setupBarActions}>
        {current.status === "submitted" && canApprove && !isSolo ? (
          <>
            <button type="button" disabled={busy} style={styles.setupBtnPrimary} onClick={() => void act(() => apiClient.approveSetupStep(brandId, current.stepKey))}>
              Approve
            </button>
            <button type="button" disabled={busy} style={styles.setupBtnGhost} onClick={handleReject}>
              Reject
            </button>
          </>
        ) : null}
        {current.status === "submitted" && !canApprove ? <span style={{ fontSize: 12, color: colors.muted }}>Waiting for approval</span> : null}
        {current.status === "not_started" || current.status === "in_progress" || current.status === "rejected" ? (
          <button type="button" disabled={busy} style={styles.setupBtnPrimary} onClick={() => void act(() => apiClient.submitSetupStep(brandId, current.stepKey))}>
            {current.status === "rejected" ? "Resubmit" : "Submit for approval"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Mobile-first shell chrome — see docs/product/creative-simplicity-audit-v1.md
 * idea G: this doesn't try to squeeze the desktop sidebar onto a phone, it
 * swaps to a fixed bottom tab bar below 700px (thumb-reachable, same
 * muscle memory as WhatsApp/Instagram), full-bleed content, and a
 * collapsed topbar. Desktop keeps the original sidebar layout untouched.
 */
function AdminShell({ active, children }: { active: (typeof NAV_ITEMS)[number]["label"]; children: React.ReactNode }) {
  const auth = useAuthContext();
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const role = auth.memberships.find((m) => m.brandId === brandId)?.role ?? null;
  // "Those menu items simply aren't shown to them" — roles doc. AppRoutes'
  // guard stops direct navigation; this is what makes it also true visually.
  const visibleNavItems = NAV_ITEMS.filter((item) => !role || ROLE_NAV_ACCESS[role].includes(item.label));
  return (
    <div style={styles.shellRoot}>
      <style>{`
        .admin-topbar { padding: 0 28px; }
        @media (max-width: 700px) { .admin-topbar { padding: 0 16px; } .admin-topbar svg { height: 34px !important; width: auto !important; } }

        .admin-shell-body { display: flex; align-items: flex-start; }
        @media (max-width: 700px) { .admin-shell-body { display: block; } }

        .admin-sidebar { width: 232px; flex-shrink: 0; }
        @media (max-width: 700px) {
          /* !important required: these overlap React's inline style={styles.sidebar}
             (width/minHeight/flexDirection/padding), which otherwise wins over a
             stylesheet media query regardless of specificity. */
          .admin-sidebar {
            width: auto !important; position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
            display: flex; flex-direction: row !important; justify-content: space-around;
            padding: 6px 4px calc(6px + env(safe-area-inset-bottom)) !important;
            min-height: 0 !important; border-right: none; border-top: 1px solid ${colors.line};
          }
          .admin-sidebar > a, .admin-sidebar > span { flex: 1; }
        }

        .admin-nav-item { flex-direction: row; }
        @media (max-width: 700px) {
          /* Same inline-style override issue as above (styles.navItem sets justifyContent/padding). */
          .admin-nav-item {
            flex-direction: column !important; align-items: center; justify-content: center !important;
            gap: 2px; padding: 6px 2px !important; font-size: 10px; text-align: center; border-radius: 10px;
          }
        }

        .admin-main { padding: 40px 40px 64px; }
        @media (max-width: 700px) { .admin-main { padding: 20px 16px calc(84px + env(safe-area-inset-bottom)); } }

        .admin-account { font-size: 12px; color: ${colors.muted}; display: flex; align-items: center; gap: 10px; }
        @media (max-width: 480px) { .admin-account span:first-child { display: none; } }

        .admin-setup-bar { padding: 10px 28px; }
        @media (max-width: 700px) { .admin-setup-bar { padding: 8px 16px; } }
      `}</style>
      <div className="admin-topbar" style={styles.topbar}>
        <div style={styles.logoRow}>
          <Logo height={55} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* Removed the separate "+ New brand" topbar link — redundant now that "New brand" is its own nav tab pointing at the same #/shop page. */}
          <div className="admin-account">
            <span>{auth.user?.displayName}</span>
            <button type="button" onClick={auth.logout} style={styles.linkButton}>
              Log out
            </button>
          </div>
        </div>
      </div>
      <SetupProgressBar />
      <div className="admin-shell-body" style={styles.shellBody}>
        <aside className="admin-sidebar" style={styles.sidebar}>
          {visibleNavItems.map((item) => {
            const isActive = item.label === active;
            const content = (
              <span className="admin-nav-item" style={{ ...styles.navItem, ...(isActive ? styles.navItemActive : {}), ...(item.route ? {} : styles.navItemDisabled) }}>
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
        <main className="admin-main" style={styles.main}>
          {children}
        </main>
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
/** One-shot banner carried across a hash navigation (e.g. Add Stock → Catalogue Center) — read once on mount, then cleared, so a refresh doesn't keep re-showing it. */
const CATALOGUE_BANNER_KEY = "saleislive:catalogueBanner";

/**
 * The "New brand" tab's real destination — Ola's "musi być opcja powrotu i
 * edycji" (there must be a way to come back and edit): if a brand already
 * exists, show its current details with an edit toggle instead of the
 * blank creation form. Only falls back to CreateBrandPage when there's
 * genuinely no brand yet for this id.
 */
function ShopSetupPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [brand, setBrand] = useState<Brand | null | undefined>(undefined);

  useEffect(() => {
    apiClient
      .getBrand(brandId)
      .then(setBrand)
      .catch(() => setBrand(null));
  }, [brandId]);

  if (brand === undefined) return <p style={styles.sub}>Loading…</p>;
  if (!brand) return <CreateBrandPage />;
  return <EditBrandForm brand={brand} onSaved={setBrand} />;
}

function EditBrandForm({ brand, onSaved }: { brand: Brand; onSaved: (b: Brand) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(brand.name);
  const [countryCode, setCountryCode] = useState<(typeof COUNTRIES)[number]["code"]>(COUNTRIES.find((c) => c.code === brand.country)?.code ?? "AE");
  const [currency, setCurrency] = useState(brand.currency);
  const [language, setLanguage] = useState(brand.language);
  const [secondaryLanguage, setSecondaryLanguage] = useState(brand.secondaryLanguage ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setName(brand.name);
    setCountryCode(COUNTRIES.find((c) => c.code === brand.country)?.code ?? "AE");
    setCurrency(brand.currency);
    setLanguage(brand.language);
    setSecondaryLanguage(brand.secondaryLanguage ?? "");
    setError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.updateBrand(brand.id, { name: name.trim(), country: countryCode, currency, language, secondaryLanguage: secondaryLanguage || null });
      onSaved(updated);
      setEditing(false);
    } catch {
      setError("Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div>
        <h1 style={styles.h1}>Set up your shop</h1>
        <p style={styles.sub}>Your shop's basic details.</p>
        <hr style={styles.divider} />
        <div style={styles.sectionCard}>
          <table style={styles.teamTable}>
            <tbody>
              <tr>
                <td style={styles.teamTd}>Name</td>
                <td style={{ ...styles.teamTd, textAlign: "right" }}>{brand.name}</td>
              </tr>
              <tr>
                <td style={styles.teamTd}>Storefront address</td>
                <td style={{ ...styles.teamTd, textAlign: "right" }}>
                  {brand.slug}.{ROOT_DOMAIN}
                </td>
              </tr>
              <tr>
                <td style={styles.teamTd}>Country</td>
                <td style={{ ...styles.teamTd, textAlign: "right" }}>{COUNTRIES.find((c) => c.code === brand.country)?.name ?? brand.country}</td>
              </tr>
              <tr>
                <td style={styles.teamTd}>Currency</td>
                <td style={{ ...styles.teamTd, textAlign: "right" }}>{brand.currency}</td>
              </tr>
              <tr>
                <td style={{ ...styles.teamTd, borderBottom: "none" }}>Language</td>
                <td style={{ ...styles.teamTd, borderBottom: "none", textAlign: "right" }}>{LANGUAGES.find((l) => l.code === brand.language)?.name ?? brand.language}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" style={{ ...styles.button, ...styles.buttonAuto }} onClick={startEdit}>
              Edit
            </button>
          </div>
        </div>
        <WizardNextButton stepKey="brand_setup" />
      </div>
    );
  }

  return (
    <div>
      <h1 style={styles.h1}>Set up your shop</h1>
      <p style={styles.sub}>Your shop's basic details. The storefront address can't be changed once set.</p>
      <hr style={styles.divider} />
      <div style={styles.fieldGrid}>
        <div>
          <label style={styles.label}>Brand / store name</label>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
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
      {error ? <p style={styles.error}>{error}</p> : null}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button type="button" style={styles.linkButton} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button type="button" disabled={saving} style={{ ...styles.button, ...styles.buttonAuto }} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/** Reached only by an already-authenticated user with no valid brand in localStorage — either an invited teammate who's never picked one, or a group_owner adding a second brand to their own tenant (a first-time signup never lands here at all, see SignUpPage/useAuth's signup). */
function CreateBrandPage() {
  const auth = useAuthContext();
  const ownedTenantId = auth.memberships.find((m) => m.role === "group_owner")?.tenantId ?? null;
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

  const canSubmit = !!ownedTenantId && name.trim().length > 0 && slug.length >= 2 && slugAvailable === true && !submitting;

  // architecture.docx's onboarding-order correction: the CTA lands directly
  // on Add Stock (screen 02), never a dashboard — the brand id is handed
  // off via localStorage so screen 02 knows which brand it's stocking.
  const onSubmit = async () => {
    if (!canSubmit || !ownedTenantId) return;
    setSubmitting(true);
    setError(null);
    try {
      const brand = await apiClient.createBrand({
        tenantId: ownedTenantId,
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

  if (!ownedTenantId) {
    return (
      <div>
        <h1 style={styles.h1}>Create your brand space</h1>
        <hr style={styles.divider} />
        <p style={styles.sub}>Only the owner of a group can add another brand to it. Ask whoever invited you to do this, or create your own account from the sign-in screen.</p>
      </div>
    );
  }

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

const ROLE_OPTIONS: Role[] = ["group_owner", "brand_admin", "merchandiser", "order_manager", "analyst", "read_only"];
const ROLE_LABELS: Record<Role, string> = {
  group_owner: "Group Owner",
  brand_admin: "Brand Admin",
  merchandiser: "Merchandiser",
  order_manager: "Order Manager",
  analyst: "Analyst",
  read_only: "Read-only",
};

/** Shown once, never stored — the admin copies it and hands it to the teammate directly, since no email infra exists yet to send it for us. */
function generateTempPassword(): string {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

/**
 * The screen that makes "several people, different roles, restricted
 * access" real instead of theoretical — see the roles matrix doc. Anyone
 * can be added with any of the 6 roles; ROLE_NAV_ACCESS in AppRoutes is
 * what actually enforces what each role can then see.
 */
function TeamPage() {
  const auth = useAuthContext();
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [team, setTeam] = useState<TeamMemberView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("merchandiser");
  const [inviting, setInviting] = useState(false);

  const reload = () => {
    apiClient
      .listTeam(brandId)
      .then(setTeam)
      .catch(() => setError("Couldn't load the team."));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const tenantId = auth.memberships.find((m) => m.brandId === brandId)?.tenantId;
    if (!tenantId) {
      setError("Couldn't determine this brand's tenant — try reloading the page.");
      return;
    }
    setInviting(true);
    try {
      const password = generateTempPassword();
      const email = inviteEmail.trim();
      await apiClient.inviteTeamMember({ email, displayName: inviteName.trim(), password, brandId, role: inviteRole, tenantId });
      setNotice(`${email} added as ${ROLE_LABELS[inviteRole]}. Temporary password: ${password} — share this with them directly, it won't be shown again.`);
      setInviteEmail("");
      setInviteName("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "That email already has an account." : "Couldn't add that teammate.");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: Role) => {
    setError(null);
    try {
      await apiClient.updateTeamMemberRole(brandId, userId, role);
      reload();
    } catch {
      setError("Couldn't change that role.");
    }
  };

  const handleRemove = async (member: TeamMemberView) => {
    if (!window.confirm(`Remove ${member.displayName} (${member.email}) from this brand?`)) return;
    setError(null);
    try {
      await apiClient.removeTeamMember(brandId, member.userId);
      reload();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "Can't remove the last Group Owner." : "Couldn't remove that teammate.");
    }
  };

  const handleResetPassword = async (member: TeamMemberView) => {
    setError(null);
    setNotice(null);
    try {
      const newPassword = await apiClient.resetTeamMemberPassword(brandId, member.userId);
      setNotice(`New password for ${member.email}: ${newPassword} — share this with them directly, it won't be shown again.`);
    } catch {
      setError("Couldn't reset that password.");
    }
  };

  return (
    <div>
      <h1 style={styles.h1}>Your team</h1>
      <p style={styles.sub}>Who has access to this brand, and what they can do.</p>
      <hr style={styles.divider} />

      {notice ? <p style={styles.noticeBox}>{notice}</p> : null}
      {error ? <p style={styles.error}>{error}</p> : null}

      <div style={styles.sectionCard}>
        {!team ? (
          <p style={styles.sub}>Loading…</p>
        ) : (
          <table style={styles.teamTable}>
            <thead>
              <tr>
                <th style={styles.teamTh}>Name</th>
                <th style={styles.teamTh}>Email</th>
                <th style={styles.teamTh}>Role</th>
                <th style={styles.teamTh} />
              </tr>
            </thead>
            <tbody>
              {team.map((member) => {
                const isSelf = member.userId === auth.user?.id;
                return (
                  <tr key={member.userId}>
                    <td style={styles.teamTd}>
                      {member.displayName}
                      {isSelf ? " (you)" : ""}
                    </td>
                    <td style={styles.teamTd}>{member.email}</td>
                    <td style={styles.teamTd}>
                      <select style={styles.teamRoleSelect} value={member.role} onChange={(e) => void handleRoleChange(member.userId, e.target.value as Role)}>
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ ...styles.teamTd, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" style={styles.linkButton} onClick={() => void handleResetPassword(member)}>
                        Reset password
                      </button>
                      {!isSelf ? (
                        <button type="button" style={{ ...styles.linkButton, color: colors.error, marginLeft: 16 }} onClick={() => void handleRemove(member)}>
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <h2 style={{ ...styles.h1, fontSize: 18, marginTop: 32 }}>Add a teammate</h2>
      <form onSubmit={(e) => void handleInvite(e)} style={styles.sectionCard}>
        <div style={styles.fieldGrid}>
          <div>
            <label style={styles.label}>Name</label>
            <input style={styles.input} value={inviteName} onChange={(e) => setInviteName(e.target.value)} required />
          </div>
          <div>
            <label style={styles.label}>Email</label>
            <input type="email" style={styles.input} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
          </div>
          <div>
            <label style={styles.label}>Role</label>
            <select style={styles.input} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" disabled={inviting} style={{ ...styles.button, ...styles.buttonAuto, opacity: inviting ? 0.6 : 1 }}>
            {inviting ? "Adding…" : "Add teammate"}
          </button>
        </div>
      </form>
      <div style={styles.wizardNextRow}>
        <a href="#/add-stock" style={{ ...styles.button, ...styles.buttonAuto, textDecoration: "none", display: "inline-block" }}>
          Next step →
        </a>
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
  dimensions: "Dimensions",
  price: "Price",
  salePrice: "Sale price",
  currency: "Currency",
  stock: "Stock",
  imageUrl: "Image",
};

/** The two ways stock actually enters the catalogue — a spreadsheet, or photos with AI filling the details. A third "add manually" form used to exist as a separate card; it's gone because every product still needs a photo to publish either way, so a single photo *is* the manual-add flow, just with AI doing more of the typing. */
type StockIntakeMethod = "excel" | "photos";

function StockIntakeCard({
  active,
  onToggle,
  icon,
  title,
  description,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ ...styles.sectionCard, marginTop: 16, padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          width: "100%",
          padding: "20px 24px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: colors.bluepale, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <p style={{ ...styles.h1, fontSize: 16, margin: 0 }}>{title}</p>
          <p style={{ ...styles.sub, margin: "2px 0 0" }}>{description}</p>
        </div>
        <span style={{ fontSize: 20, color: colors.muted, transform: active ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>⌄</span>
      </button>
      {active && <div style={{ padding: "0 24px 24px" }}>{children}</div>}
    </div>
  );
}

function SpreadsheetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </svg>
  );
}

function PhotosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.navy} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="15" height="14" rx="2" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h7A1.5 1.5 0 0 1 18 4.5V16" />
      <circle cx="10.5" cy="13" r="2" />
    </svg>
  );
}

function AiBadge() {
  return (
    <span style={{ ...styles.pill, background: colors.bluepale, color: colors.navy, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>✦ AI</span>
  );
}

function AddStockPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [brandSlug] = useState(() => window.localStorage.getItem(LAST_BRAND_SLUG_KEY));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeMethod, setActiveMethod] = useState<StockIntakeMethod | null>(null);
  const toggleMethod = (m: StockIntakeMethod) => setActiveMethod((cur) => (cur === m ? null : m));

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

  const photosInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [photosCreated, setPhotosCreated] = useState<Product[] | null>(null);

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
      const { batch: staged } = await apiClient.uploadImport(brandId, excelFile, { intakeMethod: "excel_csv", matchMethod: "sku", photoTreatment: [], fieldOverrides });
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
      // No row in this batch carried a photo — send her straight to the products
      // that need one instead of leaving her to notice and hunt for them later.
      const hadAnyPhoto = result.batch.rows.some((row) => "images" in row.changes);
      if (!hadAnyPhoto && result.summary.created + result.summary.updated > 0) {
        window.sessionStorage.setItem(
          CATALOGUE_BANNER_KEY,
          `Done — ${result.summary.created} added, ${result.summary.updated} updated. None of these rows had a photo — add one below for each.`,
        );
        window.location.hash = "#/catalogue-center";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed.");
    } finally {
      setCommitting(false);
    }
  };

  const onPhotosPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhotos(true);
    setPhotosError(null);
    setPhotosCreated(null);
    try {
      const created = await apiClient.createProductsFromPhotos(brandId, Array.from(files));
      setPhotosCreated(created);
      await loadProducts(brandId);
    } catch (err) {
      setPhotosError(err instanceof Error ? err.message : "Couldn't create products from those photos.");
    } finally {
      setUploadingPhotos(false);
    }
  };

  const readyCount = batch?.rows.filter((r) => !r.blocking).length ?? 0;
  const blockingCount = batch?.rows.filter((r) => r.blocking).length ?? 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={styles.h1}>Add your stock</h1>
          <p style={styles.sub}>Tell saleis.live what you have. Choose one or several sources.</p>
        </div>
        {brandSlug ? (
          <a href={resolveStorefrontPreviewUrl(brandSlug, window.localStorage.getItem(AUTH_TOKEN_KEY))} target="_blank" rel="noreferrer" style={styles.previewLink}>
            Preview your store →
          </a>
        ) : null}
      </div>
      <hr style={styles.divider} />

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

      <StockIntakeCard
        active={activeMethod === "excel"}
        onToggle={() => toggleMethod("excel")}
        icon={<SpreadsheetIcon />}
        title="Upload your spreadsheet"
        description="Have an Excel or CSV of your products? Photos pasted into the file are picked up automatically."
      >
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
                    const status = !currentField ? "Unmapped" : currentField === autoField ? "AI matched" : "Mapped manually";
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
      </StockIntakeCard>

      <StockIntakeCard
        active={activeMethod === "photos"}
        onToggle={() => toggleMethod("photos")}
        icon={<PhotosIcon />}
        title="Add photos"
        description="One item or many — no spreadsheet needed. AI reads each photo and fills in the details."
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <AiBadge />
          <p style={{ ...styles.sub, margin: 0 }}>Each photo becomes a draft product with category, colour, material and description already filled in — you review and set price and stock afterward.</p>
        </div>
        <input
          ref={photosInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = e.target.files;
            void onPhotosPicked(files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploadingPhotos}
          onClick={() => photosInputRef.current?.click()}
          style={{ ...styles.button, ...styles.buttonAuto, opacity: uploadingPhotos ? 0.4 : 1 }}
        >
          {uploadingPhotos ? "Uploading…" : "Choose photos"}
        </button>
        {photosError ? <p style={{ ...styles.error, marginTop: 12 }}>{photosError}</p> : null}
        {photosCreated ? (
          <p style={{ ...styles.sub, color: colors.success, fontWeight: 600, marginTop: 12, marginBottom: 0 }}>
            Created {photosCreated.length} draft product{photosCreated.length === 1 ? "" : "s"} —{" "}
            <a href="#/catalogue-center" style={styles.previewLink}>
              set price and stock in Review your products with AI →
            </a>
          </p>
        ) : null}
      </StockIntakeCard>

      {error ? <p style={styles.error}>{error}</p> : null}

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
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const badge = productStatusBadge(p);
                  return (
                    <tr key={p.id}>
                      <td style={styles.td}>{p.sku}</td>
                      <td style={styles.td}>{p.name.value ?? "—"}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.pill, background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 700 }}>{badge.label}</span>
                      </td>
                      <td style={styles.td}>{formatChange(p.price)}</td>
                      <td style={styles.td}>{p.stock}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: colors.muted }}>No products yet for this brand.</p>
        )}
      </div>
      <WizardNextButton stepKey="stock_intake" />
    </div>
  );
}

/** A transparent PNG against this app's own near-white surfaces is visually indistinguishable from an opaque photo at a glance — this makes transparency itself visible, the same way design tools show it. */
const CHECKERBOARD_BG: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #e2e2e2 25%, transparent 25%), linear-gradient(-45deg, #e2e2e2 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e2e2 75%), linear-gradient(-45deg, transparent 75%, #e2e2e2 75%)",
  backgroundColor: colors.white,
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

type PositionerBackground = { kind: "color"; color: string } | { kind: "image"; url: string } | null;

/**
 * Canva-style drag-to-move / drag-corner-to-resize product placement. Only ever
 * moves/scales the whole cutout as a rigid layer (CSS transform, no crop/filter/
 * re-encode) — the product image itself is never touched, matching what the
 * server-side compositor will do with the same offsetX/offsetY/scale fractions.
 */
function BackgroundPositioner({
  cutoutUrl,
  background,
  offsetX,
  offsetY,
  scale,
  onChange,
}: {
  cutoutUrl: string;
  background: PositionerBackground;
  offsetX: number;
  offsetY: number;
  scale: number;
  onChange: (next: { offsetX: number; offsetY: number; scale: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; startOffsetX: number; startOffsetY: number; startScale: number } | null>(null);

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const beginDrag = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.preventDefault();
    if (mode === "resize") e.stopPropagation();
    // Best-effort: capture keeps the drag tracking correctly if the pointer moves fast enough to leave this element, but a capture failure shouldn't block the drag itself.
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startOffsetX: offsetX, startOffsetY: offsetY, startScale: scale };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    if (drag.mode === "move") {
      onChange({ offsetX: clamp(drag.startOffsetX + dx, 0.05, 0.95), offsetY: clamp(drag.startOffsetY + dy, 0.05, 0.95), scale });
    } else {
      // No upper cap on scale (beyond a sane ceiling) — Ola wants to be able to zoom a product past the frame on purpose, e.g. to show a detail shot, not just shrink it to fit (2026-08-12).
      onChange({ offsetX, offsetY, scale: clamp(drag.startScale + (dx + dy) / 2, 0.15, 3) });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const backgroundStyle: React.CSSProperties = !background
    ? CHECKERBOARD_BG
    : background.kind === "color"
      ? { background: background.color }
      : { backgroundImage: `url(${background.url})`, backgroundSize: "cover", backgroundPosition: "center" };

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      // No overflow:hidden here — the div's own background (this box's rounded corners) clips fine without it, but clipping children would also cut off the resize handle whenever it's dragged near an edge, making it invisible/ungrabbable (real report, 2026-08-11).
      style={{ position: "relative", width: "100%", aspectRatio: "1", borderRadius: 10, border: `1px solid ${colors.border}`, ...backgroundStyle }}
    >
      <div
        onPointerDown={beginDrag("move")}
        title="Drag to move"
        style={{
          position: "absolute",
          left: `${offsetX * 100}%`,
          top: `${offsetY * 100}%`,
          width: `${scale * 100}%`,
          height: `${scale * 100}%`,
          transform: "translate(-50%, -50%)",
          cursor: "move",
          touchAction: "none",
        }}
      >
        <img src={cutoutUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
        <div
          onPointerDown={beginDrag("resize")}
          title="Drag to resize"
          style={{
            position: "absolute",
            right: -7,
            bottom: -7,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: colors.navy,
            border: `2px solid ${colors.white}`,
            cursor: "nwse-resize",
            touchAction: "none",
          }}
        />
      </div>
    </div>
  );
}

/** Mirrors apps/api's PRODUCT_CATEGORY_OPTIONS (routes/analyzeProduct.ts) — the fixed department list "Suggest with AI" is now constrained to, kept in sync manually since this is a plain admin-only UI constant, not a shared package export. */
const CATEGORY_OPTIONS = ["Men", "Women", "Kids", "Home", "Jewellery", "Beauty"];

function ProductStudioPage({ productId }: { productId: string }) {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [material, setMaterial] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stock, setStock] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNotConfigured, setAiNotConfigured] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [presetsMeta, setPresetsMeta] = useState<BackgroundPresetMeta[]>([]);
  const [preset, setPreset] = useState<string>("white");
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [applyingBg, setApplyingBg] = useState(false);
  const [offsetX, setOffsetX] = useState(0.5);
  const [offsetY, setOffsetY] = useState(0.5);
  const [scale, setScale] = useState(0.72);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  // Cutouts have a transparent background — against this page's own near-white
  // background that can look identical to the original at a glance, so a
  // click can silently seem to do nothing. This is the only signal that it
  // didn't: a plain "add a photo" success line would look the same either way.
  const [photoToolNotice, setPhotoToolNotice] = useState<string | null>(null);
  // The photo Photo tools reads from and writes new results onto — deliberately
  // NOT "whichever photo is currently main". Clicking a gallery thumbnail to
  // preview a result used to silently retarget Apply background at whatever
  // you'd just looked at, so re-applying with a different preset composited
  // an already-composited photo onto itself ("photo inside a photo" — real
  // report, 2026-08-12). Only Remove background (a fresh cutout) and this
  // panel's own thumbnail strip change it now.
  const [photoToolsSourceUrl, setPhotoToolsSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .listBackgroundPresets()
      .then((p) => {
        setPresetsMeta(p);
        if (p.length > 0) setPreset(p[0].key);
      })
      .catch(() => setPresetsMeta([]));
  }, []);

  const resetPosition = () => {
    setOffsetX(0.5);
    setOffsetY(0.5);
    setScale(0.72);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    apiClient
      .getProduct(brandId, productId)
      .then((p) => {
        if (cancelled) return;
        setProduct(p);
        setPhotoToolsSourceUrl((p.images.find((i) => i.isMain) ?? p.images[0])?.url ?? null);
        setName(p.name.value ?? "");
        setDescription(p.description.value ?? "");
        setCategory(p.category.value ?? "");
        setColor(p.color.value ?? "");
        setSize(p.size.value ?? "");
        setMaterial(p.material.value ?? "");
        setDimensions(p.dimensions.value ?? "");
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

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiClient.updateProduct(brandId, productId, {
        name,
        description,
        category,
        color,
        size,
        material,
        dimensions,
        price: Number(price) || 0,
        salePrice: Number(salePrice) || 0,
        stock: Number(stock) || 0,
      });
      setProduct(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const onPhotoPicked = async (file: File | null) => {
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const updated = await apiClient.addProductImage(brandId, productId, file);
      setProduct(updated);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Couldn't upload that photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onSetMainPhoto = async (url: string) => {
    if (!product) return;
    setPhotoError(null);
    try {
      setProduct(await apiClient.setMainProductImage(brandId, productId, url));
    } catch {
      setPhotoError("Couldn't set that as the main photo.");
    }
  };

  const onRemovePhoto = async (url: string) => {
    if (!product) return;
    setPhotoError(null);
    try {
      setProduct(await apiClient.removeProductImage(brandId, productId, url));
    } catch (err) {
      setPhotoError(err instanceof ApiError && err.status === 409 ? "Can't remove the only photo — add another one first." : "Couldn't remove that photo.");
    }
  };

  const onRemoveBackground = async () => {
    if (!product || !photoToolsSourceUrl) return;
    setRemovingBg(true);
    setPhotoError(null);
    setPhotoToolNotice(null);
    try {
      const updated = await apiClient.removeImageBackground(brandId, productId, photoToolsSourceUrl);
      const cutout = updated.images[updated.images.length - 1];
      const withCutoutMain = await apiClient.setMainProductImage(brandId, productId, cutout.url);
      setProduct(withCutoutMain);
      setPhotoToolsSourceUrl(cutout.url);
      resetPosition();
      setPhotoToolNotice("Background removed — this cutout is now the main photo (shown on a checkered pattern above so the transparency is visible). Pick a background below, then drag it into place.");
    } catch (err) {
      setPhotoError(err instanceof ApiError && err.status === 422 ? "Couldn't find a clear product in that photo — try a different one." : "Background removal failed.");
    } finally {
      setRemovingBg(false);
    }
  };

  const onSelectPreset = (key: string) => {
    setPreset(key);
    setCustomBgUrl(null);
    setPhotoToolNotice(null);
  };

  const onUploadCustomBackground = async (file: File | null) => {
    if (!file) return;
    setUploadingBg(true);
    setPhotoError(null);
    try {
      setCustomBgUrl(await apiClient.uploadCustomBackground(brandId, file));
      setPhotoToolNotice(null);
    } catch {
      setPhotoError("Couldn't upload that background.");
    } finally {
      setUploadingBg(false);
    }
  };

  const onApplyBackground = async () => {
    if (!product || !photoToolsSourceUrl) return;
    setApplyingBg(true);
    setPhotoError(null);
    try {
      // Deliberately doesn't touch photoToolsSourceUrl or product-main — stays
      // pointed at the same cutout so trying several different backgrounds in a
      // row keeps compositing from the clean source, never from a previous result.
      setProduct(await apiClient.applyBackgroundPreset(brandId, productId, photoToolsSourceUrl, customBgUrl ? null : preset, { offsetX, offsetY, scale, customBackgroundUrl: customBgUrl ?? undefined }));
      setPhotoToolNotice("Background applied — added as a new photo in the gallery below. Pick another background to try again on the same cutout.");
    } catch {
      setPhotoError("Couldn't apply that background.");
    } finally {
      setApplyingBg(false);
    }
  };

  if (loading) return <p style={styles.sub}>Loading…</p>;
  if (notFound || !product) return <p style={styles.error}>Product not found.</p>;

  const mainImage = product.images.find((i) => i.isMain) ?? product.images[0];
  const resolveImg = (url: string) => (url.startsWith("http") ? url : apiClient.resolveAssetUrl(url));

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
      <a href="#/catalogue-center" style={{ ...styles.previewLink, display: "inline-block", marginBottom: 12 }}>
        ← Back to Review your products with AI
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={styles.h1}>Product Studio</h1>
        <span
          style={{
            ...styles.pill,
            background: productStatusBadge(product).bg,
            color: productStatusBadge(product).color,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {productStatusBadge(product).label}
        </span>
      </div>
      <p style={styles.sub}>Edit one product, its images, copy and variants.</p>
      <hr style={styles.divider} />

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ ...styles.sectionCard, width: 320, flexShrink: 0 }}>
          <h2 style={{ ...styles.h1, fontSize: 15, marginBottom: 16 }}>Product media</h2>
          {mainImage ? (
            <div style={{ position: "relative" }}>
              {/* objectFit: "contain" (not "cover") — shows the whole photo, never crops it; the box just letterboxes around whatever shape the photo is. */}
              {/* Checkerboard, not a flat colour: a transparent cutout on a flat surface looks identical to an opaque photo at a glance — see CHECKERBOARD_BG's comment. */}
              <img
                src={resolveImg(mainImage.url)}
                alt={mainImage.alt}
                onClick={() => setZoomOpen(true)}
                style={{ width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 10, cursor: "zoom-in", ...CHECKERBOARD_BG }}
              />
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                title="Zoom in to check detail"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  border: "none",
                  borderRadius: 999,
                  background: "rgba(17,17,17,0.65)",
                  color: colors.white,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                🔍 Zoom
              </button>
            </div>
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

          {product.images.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {product.images.map((img) => (
                <div key={img.url} style={{ position: "relative", width: 52, height: 52 }}>
                  <button
                    type="button"
                    onClick={() => void onSetMainPhoto(img.url)}
                    title={img.isMain ? "Main photo" : "Set as main photo"}
                    style={{
                      width: 52,
                      height: 52,
                      padding: 0,
                      borderRadius: 8,
                      border: img.isMain ? `2px solid ${colors.navy}` : `1px solid ${colors.border}`,
                      cursor: "pointer",
                      overflow: "hidden",
                      ...CHECKERBOARD_BG,
                    }}
                  >
                    <img src={resolveImg(img.url)} alt={img.alt} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </button>
                  {product.images.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => void onRemovePhoto(img.url)}
                      title="Remove photo"
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        border: "none",
                        background: colors.error,
                        color: colors.white,
                        fontSize: 11,
                        lineHeight: "18px",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              void onPhotoPicked(file);
            }}
          />
          <button
            type="button"
            disabled={uploadingPhoto}
            onClick={() => photoInputRef.current?.click()}
            style={{ ...styles.button, ...styles.buttonAuto, width: "100%", marginTop: 12, opacity: uploadingPhoto ? 0.5 : 1 }}
          >
            {uploadingPhoto ? "Uploading…" : "Add a photo"}
          </button>
          <p style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>Best results: a square JPEG or PNG, at least 1200 × 1200px, plain background.</p>
          {photoError ? <p style={{ ...styles.error, marginTop: 8 }}>{photoError}</p> : null}

          <hr style={{ ...styles.divider, margin: "16px 0" }} />
          <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px" }}>Photo tools</p>
          {product.images.length > 1 ? (
            <>
              <p style={{ fontSize: 11, color: colors.muted, margin: "0 0 6px" }}>Working on:</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {product.images.map((img) => (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => setPhotoToolsSourceUrl(img.url)}
                    title={img.alt}
                    style={{
                      width: 36,
                      height: 36,
                      padding: 0,
                      borderRadius: 6,
                      border: photoToolsSourceUrl === img.url ? `2px solid ${colors.navy}` : `1px solid ${colors.border}`,
                      cursor: "pointer",
                      overflow: "hidden",
                      ...CHECKERBOARD_BG,
                    }}
                  >
                    <img src={resolveImg(img.url)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <button
            type="button"
            disabled={removingBg || !photoToolsSourceUrl}
            onClick={() => void onRemoveBackground()}
            style={{ ...styles.button, ...styles.buttonAuto, width: "100%", background: colors.white, color: colors.ink, border: `1px solid ${colors.border}`, opacity: removingBg || !photoToolsSourceUrl ? 0.5 : 1 }}
          >
            {removingBg ? "Removing background…" : "Remove background"}
          </button>

          <p style={{ fontSize: 11, fontWeight: 600, color: colors.muted, margin: "12px 0 6px" }}>Choose a background</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {presetsMeta.map((p) => {
              const active = !customBgUrl && preset === p.key;
              const label = p.key
                .split("-")
                .map((w) => w[0].toUpperCase() + w.slice(1))
                .join(" ");
              return (
                <button
                  key={p.key}
                  type="button"
                  title={`${label} background`}
                  onClick={() => onSelectPreset(p.key)}
                  style={{
                    width: 42,
                    height: 42,
                    padding: 0,
                    borderRadius: 8,
                    border: active ? `2px solid ${colors.navy}` : `1px solid ${colors.border}`,
                    cursor: "pointer",
                    overflow: "hidden",
                    background: p.kind === "color" ? p.color : undefined,
                  }}
                >
                  {p.kind === "image" ? <img src={apiClient.resolveAssetUrl(p.thumbnailUrl)} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                </button>
              );
            })}
            <button
              type="button"
              title="Upload your own background"
              disabled={uploadingBg}
              onClick={() => bgFileInputRef.current?.click()}
              style={{
                width: 42,
                height: 42,
                padding: 0,
                borderRadius: 8,
                border: customBgUrl ? `2px solid ${colors.navy}` : `1px dashed ${colors.border}`,
                cursor: "pointer",
                background: customBgUrl ? undefined : colors.background,
                overflow: "hidden",
                fontSize: 18,
                color: colors.muted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: uploadingBg ? 0.5 : 1,
              }}
            >
              {customBgUrl ? <img src={apiClient.resolveAssetUrl(customBgUrl)} alt="Custom background" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "+"}
            </button>
            <input
              ref={bgFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onUploadCustomBackground(file);
              }}
            />
          </div>

          {photoToolsSourceUrl ? (
            <div style={{ marginTop: 10 }}>
              <BackgroundPositioner
                cutoutUrl={resolveImg(photoToolsSourceUrl)}
                background={
                  customBgUrl
                    ? { kind: "image", url: apiClient.resolveAssetUrl(customBgUrl) }
                    : (() => {
                        const meta = presetsMeta.find((p) => p.key === preset);
                        if (!meta) return null;
                        return meta.kind === "color" ? { kind: "color", color: meta.color } : { kind: "image", url: apiClient.resolveAssetUrl(meta.thumbnailUrl) };
                      })()
                }
                offsetX={offsetX}
                offsetY={offsetY}
                scale={scale}
                onChange={(next) => {
                  setOffsetX(next.offsetX);
                  setOffsetY(next.offsetY);
                  setScale(next.scale);
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <p style={{ fontSize: 11, color: colors.muted, margin: 0 }}>Drag to move, drag the dot to resize</p>
                <button type="button" onClick={resetPosition} style={{ ...styles.previewLink, fontSize: 11, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  Reset position
                </button>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={applyingBg || !photoToolsSourceUrl || (presetsMeta.length === 0 && !customBgUrl)}
            onClick={() => void onApplyBackground()}
            style={{ ...styles.button, ...styles.buttonAuto, width: "100%", marginTop: 10, opacity: applyingBg || !photoToolsSourceUrl ? 0.5 : 1 }}
          >
            {applyingBg ? "Applying…" : "Apply background"}
          </button>
          {photoToolNotice ? <p style={{ fontSize: 11, color: colors.navy, marginTop: 8 }}>{photoToolNotice}</p> : null}
          <p style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>
            "Apply background" adds a new photo to the gallery rather than replacing anything — try as many backgrounds as you like on the same "Working on" photo above, they won't overwrite each other.
          </p>
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
                <select style={styles.input} value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Select…</option>
                  {/* Keeps whatever this product already had (e.g. from an older import) selectable even if it predates this fixed list, rather than silently changing the value. */}
                  {category && !CATEGORY_OPTIONS.includes(category) ? <option value={category}>{category}</option> : null}
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
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
                <label style={styles.label}>Size</label>
                <input style={styles.input} value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. S/M, 37–41, 30ml" />
              </div>
              <div>
                <label style={styles.label}>Material</label>
                <input style={styles.input} value={material} onChange={(e) => setMaterial(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>Dimensions</label>
                <input style={styles.input} value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="e.g. 30 x 20 x 10 cm" />
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
                  Reads the product photo and suggests colour, material, category and a description above — review before saving. AR/EN translation isn't wired up yet. Nothing is written until you click Save.
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
            {saved ? (
              <p style={{ ...styles.sub, color: colors.success, fontWeight: 600, marginTop: 12, marginBottom: 0 }}>
                {product.status === "active" ? "Saved — live on your store." : "Saved — still incomplete, so not visible on your store yet."}
              </p>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button style={{ ...styles.button, ...styles.buttonAuto, opacity: saving ? 0.4 : 1 }} disabled={saving} onClick={() => void onSave()}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {zoomOpen && mainImage ? (
        <div
          onClick={() => setZoomOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, cursor: "zoom-out" }}
        >
          <img src={resolveImg(mainImage.url)} alt={mainImage.alt} style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 }} />
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            style={{ position: "absolute", top: 20, right: 24, border: "none", background: "none", color: colors.white, fontSize: 28, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

type CatalogueTab = "attention" | "ready" | "all";

/**
 * The one status badge shown everywhere a product appears — Catalogue
 * Center's table and the top of Product Studio. There used to be a
 * separate manual "Approve" step that flipped `product.status` with no
 * visible result anywhere; the server now derives status from
 * isCatalogueReady on every save (see routes/products.ts), so this
 * reflects reality directly instead of a click nobody could see the
 * effect of (Ola, 2026-08-11: "I don't understand which are accepted,
 * which aren't, or whether they're published"). "Ready — save to
 * publish" only shows for a product that's complete but has never been
 * saved in Product Studio yet (e.g. straight off an Excel import, which
 * deliberately never auto-publishes — see buildProductFromImportRow).
 */
function productStatusBadge(p: Product): { label: string; color: string; bg: string } {
  if (p.status === "active") return { label: "Live", color: colors.success, bg: "#E6F4EA" };
  if (isCatalogueReady(p)) return { label: "Accepted — save to publish", color: colors.navy, bg: colors.bluepale };
  return { label: "Incomplete", color: colors.error, bg: "#FBE9E7" };
}

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

function CatalogueCenterPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<CatalogueTab>("attention");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // One-shot: carried from Add Stock after a photo-less Excel import (see onCommit) — read once, then gone, so refreshing this page doesn't keep re-showing it.
  // Must live in an effect, not a useState initializer — React 18 StrictMode double-invokes initializers in dev, and the second call would find sessionStorage already cleared by the first.
  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => {
    const msg = window.sessionStorage.getItem(CATALOGUE_BANNER_KEY);
    if (msg) {
      window.sessionStorage.removeItem(CATALOGUE_BANNER_KEY);
      setBanner(msg);
    }
  }, []);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string | null>(null);

  const reloadProducts = () => apiClient.listBrandProducts(brandId).then(setProducts);

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

  const handleDelete = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name.value ?? p.sku}" (SKU ${p.sku})? This can't be undone.`)) return;
    setDeletingId(p.id);
    try {
      await apiClient.deleteProduct(brandId, p.id);
      await reloadProducts();
    } catch {
      window.alert("Couldn't delete that product. Try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddPhotoClick = (productId: string) => {
    photoTargetRef.current = productId;
    photoInputRef.current?.click();
  };

  const handlePhotoFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const productId = photoTargetRef.current;
    e.target.value = "";
    if (!file || !productId) return;
    setUploadingPhotoFor(productId);
    setPhotoError(null);
    try {
      await apiClient.addProductImage(brandId, productId, file);
      await reloadProducts();
    } catch {
      setPhotoError("Couldn't upload that photo. Try again.");
    } finally {
      setUploadingPhotoFor(null);
    }
  };

  if (loading) return <p style={styles.sub}>Loading…</p>;

  const all = products ?? [];
  const ready = all.filter(isCatalogueReady);
  const needsAttention = all.filter((p) => !isCatalogueReady(p));
  const missingPhoto = all.filter((p) => p.images.length === 0);
  const unsorted = tab === "ready" ? ready : tab === "all" ? all : needsAttention;
  // Missing-photo rows first — that's the fix most merchants are here to make in one pass.
  const rows = [...unsorted].sort((a, b) => Number(a.images.length > 0) - Number(b.images.length > 0));

  return (
    <div>
      <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoFileChosen} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={styles.h1}>Review your products with AI</h1>
          <p style={styles.sub}>Real readiness, computed from your actual catalogue data.</p>
        </div>
        <a href={resolveCatalogueExportUrl(brandId)} style={styles.previewLink}>
          Export to Excel
        </a>
      </div>
      {banner && (
        <p style={{ fontSize: 13, color: colors.navy, background: colors.bluepale, padding: "10px 14px", borderRadius: 8, marginTop: 12 }}>{banner}</p>
      )}
      {photoError && <p style={{ fontSize: 13, color: colors.error, marginTop: 12 }}>{photoError}</p>}
      <hr style={styles.divider} />

      <div style={styles.tileGrid}>
        <div style={styles.sectionCard}>
          <p style={styles.statLabel}>Accepted</p>
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
          Accepted ({ready.length})
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
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Issue</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const issues = describeProductIssues(p);
                  const missingPhotoRow = p.images.length === 0;
                  const badge = productStatusBadge(p);
                  return (
                    <tr key={p.id}>
                      <td style={styles.td}>{p.name.value ?? "—"}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.pill, background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 700 }}>{badge.label}</span>
                      </td>
                      <td style={styles.td}>{p.sku}</td>
                      <td style={{ ...styles.td, fontSize: 11, color: issues.length ? colors.error : colors.success }}>{issues.length ? issues.join(", ") : "All good"}</td>
                      <td style={{ ...styles.td, display: "flex", gap: 12, alignItems: "center" }}>
                        {missingPhotoRow && (
                          <button
                            type="button"
                            onClick={() => handleAddPhotoClick(p.id)}
                            disabled={uploadingPhotoFor === p.id}
                            style={{ background: "none", border: `1px solid ${colors.navy}`, color: colors.navy, fontSize: 12, cursor: "pointer", padding: "4px 10px", borderRadius: 999 }}
                          >
                            {uploadingPhotoFor === p.id ? "Uploading…" : "Add photo"}
                          </button>
                        )}
                        <a href={`#/products/${encodeURIComponent(p.id)}`} style={styles.previewLink}>
                          Fix in Product Studio →
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          style={{ background: "none", border: "none", color: colors.error, fontSize: 12, cursor: "pointer", padding: 0 }}
                        >
                          {deletingId === p.id ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ImportHistorySection brandId={brandId} />
      <WizardNextButton stepKey="ai_catalogue_review" />
    </div>
  );
}

/** "Wrong file uploaded by mistake" — Ola's own words. Committed batches can be rolled back once: rows they added are deleted, rows they updated are reverted to their pre-import values (see the rollback route's doc comment for exactly what — never touches images). */
function ImportHistorySection({ brandId }: { brandId: string }) {
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = () => apiClient.listImportBatches(brandId).then(setBatches);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listImportBatches(brandId)
      .then((b) => {
        if (!cancelled) setBatches(b);
      })
      .catch(() => {
        if (!cancelled) setBatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const handleRollback = async (batch: ImportBatch) => {
    if (!window.confirm(`Undo "${batch.fileName || "this import"}"? Products it added will be deleted, products it updated will revert to their previous values. Photos are left as-is.`)) return;
    setRollingBackId(batch.id);
    setNotice(null);
    try {
      const { summary } = await apiClient.rollbackImportBatch(batch.id);
      setNotice(`Undone — ${summary.deleted} product${summary.deleted === 1 ? "" : "s"} removed, ${summary.reverted} reverted.`);
      await reload();
    } catch {
      window.alert("Couldn't undo that import. Try again.");
    } finally {
      setRollingBackId(null);
    }
  };

  const relevant = (batches ?? []).filter((b) => b.fileName && b.status !== "staged");
  if (batches !== null && relevant.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      {/* Collapsed by default and reframed around the one thing a merchant would come here for — not labelled as "Import history", which reads as an engineering log, not a tool (Ola, 2026-08-11: "I don't know what this is"). */}
      <details style={{ ...styles.sectionCard }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>Fix a wrong upload</summary>
        <p style={{ ...styles.sub, marginTop: 8 }}>Uploaded the wrong file? Undo it here — it only affects what that import actually changed.</p>
        {notice && <p style={{ fontSize: 13, color: colors.success }}>{notice}</p>}
        {batches === null ? (
          <p style={styles.sub}>Loading…</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>File</th>
                  <th style={styles.th}>Uploaded</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {relevant.map((b) => (
                  <tr key={b.id}>
                    <td style={styles.td}>{b.fileName}</td>
                    <td style={styles.td}>{new Date(b.createdAt).toLocaleString()}</td>
                    <td style={styles.td}>{b.status === "committed" ? "Added to your catalogue" : "Undone"}</td>
                    <td style={styles.td}>
                      {b.status === "committed" && (
                        <button
                          type="button"
                          onClick={() => handleRollback(b)}
                          disabled={rollingBackId === b.id}
                          style={{ background: "none", border: "none", color: colors.error, fontSize: 12, cursor: "pointer", padding: 0 }}
                        >
                          {rollingBackId === b.id ? "Undoing…" : "Undo this import"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}

// Was 5 flat tabs (Sale/Store/Payments/Delivery/Policies) with one shared
// Save button that silently wrote both Sale-info and Store-design fields
// together no matter which tab was open — confusing, since it looked like
// two separate steps but wasn't (Ola, 2026-08-12). Payments/Delivery/
// Policies are all "things you connect before going fully live", not
// storefront content, so they're one combined tab now.
type LaunchTab = "sale" | "store";
const LAUNCH_TABS: LaunchTab[] = ["sale", "store"];
const LAUNCH_TAB_LABELS: Record<LaunchTab, string> = { sale: "Sale info", store: "Store design" };

const CAMPAIGN_ACCESS_OPTIONS: { key: CampaignAccess; label: string; description: string }[] = [
  { key: "public", label: "Public", description: "Anyone can find and view this sale." },
  { key: "private", label: "Private / Unlisted", description: "Anyone with the link can view it, no password — just hidden from search and not listed anywhere. Best for sharing a Share Card straight to WhatsApp." },
  { key: "password", label: "Password", description: "Anyone with the link needs the shared password below to get in." },
  { key: "invite", label: "Invite only", description: "Coming later (a real allowlist of invited people). For now this behaves the same as Private / Unlisted — link required, no password." },
];

const THEME_PRESET_OPTIONS: { key: ThemePresetId; label: string }[] = [
  { key: "editorial", label: "Editorial" },
  { key: "minimal", label: "Minimal" },
  { key: "high_density", label: "Dense" },
];

/** Grouped from the platform's fixed licensed font list (packages/domain/src/theme.ts's APPROVED_FONTS) — Ola asked for "a few modern and a few elegant" hero fonts to choose from, not a free font picker. */
const HERO_FONT_GROUPS: { group: string; fonts: (typeof APPROVED_FONTS)[number][] }[] = [
  { group: "Modern", fonts: ["Inter", "Manrope", "Space Grotesk"] },
  { group: "Elegant", fonts: ["Instrument Serif", "Playfair Display"] },
];
const DEFAULT_HERO_FONT = "Instrument Serif";
const HERO_COLOR_OPTIONS = Object.entries(HERO_COLOR_PRESETS) as [HeroColorPresetId, (typeof HERO_COLOR_PRESETS)[HeroColorPresetId]][];

function LaunchStudioPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [tab, setTab] = useState<LaunchTab>("sale");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [access, setAccess] = useState<CampaignAccess>("public");
  const [hasAccessPassword, setHasAccessPassword] = useState(false);
  const [accessPasswordInput, setAccessPasswordInput] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [headline, setHeadline] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [heroDesktopUrl, setHeroDesktopUrl] = useState("");
  const [heroMobileUrl, setHeroMobileUrl] = useState("");
  const [themePreset, setThemePreset] = useState<ThemePresetId>("editorial");
  const [heroColorPreset, setHeroColorPreset] = useState<HeroColorPresetId | null>(null);
  const [heroFontPreset, setHeroFontPreset] = useState<string | null>(null);
  const [uploadingHero, setUploadingHero] = useState<"desktop" | "mobile" | null>(null);
  const heroDesktopInputRef = useRef<HTMLInputElement>(null);
  const heroMobileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
        setHasAccessPassword(c.hasAccessPassword);
        setStartsAt(c.startsAt.slice(0, 16));
        setEndsAt(c.endsAt ? c.endsAt.slice(0, 16) : "");
        setHeadline(c.headline);
        setShortDescription(c.shortDescription);
        setHeroDesktopUrl(c.heroDesktopUrl ?? "");
        setHeroMobileUrl(c.heroMobileUrl ?? "");
        setThemePreset(c.themePreset);
        setHeroColorPreset(c.heroColorPreset);
        setHeroFontPreset(c.heroFontPreset);
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

  // Two distinct publish actions, not one shared save behind both tabs —
  // Sale info (who can access, when it runs, which products) and Store
  // design (what visitors actually see) are genuinely separate decisions,
  // and sharing a single Save silently rewrote whichever tab wasn't open.
  const onPublishSaleInfo = async () => {
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
      });
      setCampaign(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  // Separate from onPublishSaleInfo on purpose: the password field is
  // almost always empty (it's write-only, never read back), so bundling it
  // into the main Publish button would either silently overwrite a real
  // password with blank on every unrelated save, or need extra "only send
  // if non-empty" logic that's easy to get wrong. A dedicated action makes
  // "set/change the password" its own explicit, unambiguous step.
  const onSetAccessPassword = async () => {
    if (!campaign || !accessPasswordInput.trim()) return;
    setSavingPassword(true);
    setError(null);
    setPasswordSaved(false);
    try {
      await apiClient.updateCampaign(campaign.id, { accessPassword: accessPasswordInput.trim() });
      setHasAccessPassword(true);
      setAccessPasswordInput("");
      setPasswordSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const onPublishStoreDesign = async () => {
    if (!campaign) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiClient.updateCampaign(campaign.id, {
        headline,
        shortDescription,
        heroDesktopUrl: heroDesktopUrl || null,
        heroMobileUrl: heroMobileUrl || null,
        themePreset,
        heroColorPreset,
        heroFontPreset,
      });
      setCampaign(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const onHeroFilePicked = async (slot: "desktop" | "mobile", file: File | null) => {
    if (!file) return;
    setUploadingHero(slot);
    setError(null);
    try {
      const url = await apiClient.uploadHeroImage(brandId, file);
      if (slot === "desktop") setHeroDesktopUrl(url);
      else setHeroMobileUrl(url);
    } catch {
      setError("Couldn't upload that image.");
    } finally {
      setUploadingHero(null);
    }
  };

  // Unlike hero image/colour/font, the logo commits immediately on upload
  // rather than waiting for "Publish" — same as Product Studio's photo
  // tools, and it lives on Brand (not Campaign) so there's nothing else on
  // this tab's Publish action that could plausibly bundle it in.
  const onLogoFilePicked = async (file: File | null) => {
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      setBrand(await apiClient.uploadBrandLogo(brandId, file));
    } catch {
      setError("Couldn't upload that logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  if (loading) return <p style={styles.sub}>Loading…</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={styles.h1}>Set up your sale</h1>
          <p style={styles.sub}>Sale details, how your store looks, and connecting payments/delivery — nothing here is visible to customers until you Go live.</p>
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
            {LAUNCH_TAB_LABELS[t]}
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
          <p style={{ fontSize: 12, color: colors.muted, margin: "8px 0 0" }}>{CAMPAIGN_ACCESS_OPTIONS.find((a) => a.key === access)?.description}</p>

          {access === "password" ? (
            <div style={{ marginTop: 12, padding: 12, border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.background }}>
              <label style={styles.label}>{hasAccessPassword ? "Change password" : "Set password"}</label>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  type="text"
                  value={accessPasswordInput}
                  onChange={(e) => {
                    setAccessPasswordInput(e.target.value);
                    setPasswordSaved(false);
                  }}
                  placeholder={hasAccessPassword ? "New password" : "Choose a password"}
                />
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.buttonAuto, opacity: !accessPasswordInput.trim() || savingPassword ? 0.4 : 1 }}
                  disabled={!accessPasswordInput.trim() || savingPassword}
                  onClick={() => void onSetAccessPassword()}
                >
                  {savingPassword ? "Saving…" : "Set"}
                </button>
              </div>
              <p style={{ fontSize: 11, color: hasAccessPassword ? colors.success : colors.muted, margin: "6px 0 0" }}>
                {passwordSaved ? "Password updated." : hasAccessPassword ? "A password is set — share it with whoever you send this sale to." : "No password set yet — the sale won't unlock for anyone until you set one."}
              </p>
            </div>
          ) : null}

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
          {saved ? <p style={{ ...styles.sub, color: colors.success, fontWeight: 600, marginTop: 12, marginBottom: 0 }}>Published.</p> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button style={{ ...styles.button, ...styles.buttonAuto, opacity: saving ? 0.4 : 1 }} disabled={saving} onClick={onPublishSaleInfo}>
              {saving ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "store" ? (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ ...styles.sectionCard, flex: 1, minWidth: 320 }}>
            <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Store design</h2>

            <label style={styles.label}>Logo</label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onLogoFilePicked(file);
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 8,
                  border: `1px dashed ${colors.border}`,
                  background: brand?.logoUrl ? `url(${apiClient.resolveAssetUrl(brand.logoUrl)}) center/contain no-repeat` : colors.background,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {!brand?.logoUrl ? <span style={{ fontSize: 9, color: colors.muted }}>No logo</span> : null}
              </div>
              <button
                type="button"
                disabled={uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
                style={{ ...styles.button, ...styles.buttonAuto, fontSize: 12, padding: "8px 14px", opacity: uploadingLogo ? 0.5 : 1 }}
              >
                {uploadingLogo ? "Uploading…" : brand?.logoUrl ? "Replace logo" : "Upload logo"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>Shown on your storefront's header. Best results: a transparent PNG, roughly 400 × 160px.</p>

            <label style={{ ...styles.label, marginTop: 16 }}>Headline</label>
            <input style={styles.input} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. The private sale is live." />
            <label style={styles.label}>Short description (optional)</label>
            <input style={styles.input} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} placeholder="e.g. Selected pieces. Limited time." />

            <label style={{ ...styles.label, marginTop: 16 }}>Hero image</label>
            <input
              ref={heroDesktopInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onHeroFilePicked("desktop", file);
              }}
            />
            <input
              ref={heroMobileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onHeroFilePicked("mobile", file);
              }}
            />
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    aspectRatio: "16/9",
                    borderRadius: 8,
                    border: `1px dashed ${colors.border}`,
                    background: heroDesktopUrl ? `url(${apiClient.resolveAssetUrl(heroDesktopUrl)}) center/cover` : colors.background,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {!heroDesktopUrl ? <span style={{ fontSize: 11, color: colors.muted }}>No image</span> : null}
                </div>
                <button
                  type="button"
                  disabled={uploadingHero === "desktop"}
                  onClick={() => heroDesktopInputRef.current?.click()}
                  style={{ ...styles.button, ...styles.buttonAuto, width: "100%", marginTop: 6, fontSize: 12, padding: "8px 12px", opacity: uploadingHero === "desktop" ? 0.5 : 1 }}
                >
                  {uploadingHero === "desktop" ? "Uploading…" : "Upload desktop hero"}
                </button>
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    aspectRatio: "16/9",
                    borderRadius: 8,
                    border: `1px dashed ${colors.border}`,
                    background: heroMobileUrl ? `url(${apiClient.resolveAssetUrl(heroMobileUrl)}) center/cover` : colors.background,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {!heroMobileUrl ? <span style={{ fontSize: 11, color: colors.muted }}>No image</span> : null}
                </div>
                <button
                  type="button"
                  disabled={uploadingHero === "mobile"}
                  onClick={() => heroMobileInputRef.current?.click()}
                  style={{ ...styles.button, ...styles.buttonAuto, width: "100%", marginTop: 6, fontSize: 12, padding: "8px 12px", opacity: uploadingHero === "mobile" ? 0.5 : 1 }}
                >
                  {uploadingHero === "mobile" ? "Uploading…" : "Upload mobile hero"}
                </button>
              </div>
            </div>
            <p style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
              Best results: desktop 1920 × 1080px, mobile 1080 × 1350px, JPG or PNG. Optional — without one, the colour below fills the hero instead.
            </p>

            <label style={{ ...styles.label, marginTop: 16 }}>Background colour (used if you don't upload a hero photo)</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {HERO_COLOR_OPTIONS.map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  title={preset.label}
                  onClick={() => setHeroColorPreset(key)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    border: heroColorPreset === key ? `2px solid ${colors.navy}` : `1px solid ${colors.border}`,
                    background: preset.background,
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>

            <label style={{ ...styles.label, marginTop: 16 }}>Hero font</label>
            {HERO_FONT_GROUPS.map((g) => (
              <div key={g.group} style={{ marginTop: 6 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: colors.muted, textTransform: "uppercase", margin: "0 0 4px" }}>{g.group}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {g.fonts.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setHeroFontPreset(f)}
                      style={{
                        ...styles.pillButton,
                        ...((heroFontPreset ?? DEFAULT_HERO_FONT) === f ? styles.pillButtonActive : {}),
                        fontFamily: f,
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <label style={{ ...styles.label, marginTop: 16 }}>Layout</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {THEME_PRESET_OPTIONS.map((t) => (
                <button key={t.key} type="button" style={{ ...styles.pillButton, ...(themePreset === t.key ? styles.pillButtonActive : {}) }} onClick={() => setThemePreset(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ ...styles.reassuranceCard, marginTop: 20 }}>
              <h2 style={styles.reassuranceTitle}>Design your hero (Canva / Figma)</h2>
              <p style={styles.reassuranceBody}>
                Not connected yet — designing here and having it land at the right size automatically needs a Canva or Figma developer account with an app registered on their side first (their Connect/API program), which only you can set up since it's tied to your own Canva/Figma account. Once you have that, this is where we'd wire it in. For now: design at{" "}
                <strong>1920 × 1080px (desktop)</strong> / <strong>1080 × 1350px (mobile)</strong> in whatever tool you like, then upload it above.
              </p>
            </div>

            {error ? <p style={styles.error}>{error}</p> : null}
            {saved ? <p style={{ ...styles.sub, color: colors.success, fontWeight: 600, marginTop: 12, marginBottom: 0 }}>Published.</p> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button style={{ ...styles.button, ...styles.buttonAuto, opacity: saving ? 0.4 : 1 }} disabled={saving} onClick={onPublishStoreDesign}>
                {saving ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>

          <div style={{ ...styles.sectionCard, width: 340, flexShrink: 0 }}>
            <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>Live preview</h2>
            <div
              style={{
                borderRadius: 12,
                padding: 28,
                textAlign: "center",
                background: heroDesktopUrl ? `url(${apiClient.resolveAssetUrl(heroDesktopUrl)}) center/cover` : (heroColorPreset ? HERO_COLOR_PRESETS[heroColorPreset].background : colors.background),
                position: "relative",
                overflow: "hidden",
              }}
            >
              {heroDesktopUrl ? <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} /> : null}
              <div style={{ position: "relative" }}>
                <p
                  style={{
                    fontFamily: heroFontPreset ?? DEFAULT_HERO_FONT,
                    fontSize: 26,
                    margin: "0 0 12px",
                    color: heroDesktopUrl ? colors.white : heroColorPreset ? HERO_COLOR_PRESETS[heroColorPreset].text : colors.ink,
                  }}
                >
                  {headline || "Your headline here"}
                </p>
                <p style={{ fontSize: 13, margin: "0 0 16px", color: heroDesktopUrl ? colors.white : heroColorPreset ? HERO_COLOR_PRESETS[heroColorPreset].text : colors.muted, opacity: 0.85 }}>
                  {shortDescription || "Your short description here"}
                </p>
                <span style={{ ...styles.pill, background: colors.navy, color: colors.white, padding: "8px 20px" }}>Shop now</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <WizardNextButton stepKey="launch_setup" />
    </div>
  );
}

/** Split out of Launch Studio (2026-08-12, Ola: "payment i delivery chciałam żeby było zupełnie nowa zakładka") — Payments/Delivery/Policies live entirely on Brand, not Campaign, so this loads independently of Sale info/Store design. Same wizard step (launch_setup) as Launch Studio, just a separate sidebar destination. */
function PaymentsDeliveryPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnPolicy, setReturnPolicy] = useState("");
  const [shippingPolicy, setShippingPolicy] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getBrand(brandId)
      .then((b) => {
        if (cancelled) return;
        setBrand(b);
        setReturnPolicy(b.returnPolicy ?? "");
        setShippingPolicy(b.shippingPolicy ?? "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

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
      <h1 style={styles.h1}>Payments & delivery</h1>
      <p style={styles.sub}>Connect your own processor and courier, and set the policies customers will see at checkout.</p>
      <hr style={styles.divider} />
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <IntegrationPanel kind="payment" brandId={brandId} integration={brand?.paymentIntegration ?? null} onUpdated={setBrand} />
        <IntegrationPanel kind="delivery" brandId={brandId} integration={brand?.deliveryIntegration ?? null} onUpdated={setBrand} />
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
          {saved ? <p style={{ ...styles.sub, color: colors.success, fontWeight: 600, marginTop: 12, marginBottom: 0 }}>Published.</p> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button style={{ ...styles.button, ...styles.buttonAuto, opacity: saving ? 0.4 : 1 }} disabled={saving} onClick={() => void onSavePolicies()}>
              {saving ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      </div>
      <WizardNextButton stepKey="launch_setup" />
    </div>
  );
}

const INTEGRATION_COPY: Record<
  "payment" | "delivery",
  { title: string; intro: string; weCall: { method: string; path: string; body: string; response: string }[]; theyCall: { body: string } }
> = {
  payment: {
    title: "Payments",
    intro:
      "Saleis.live never holds buyer funds and never sees a card number. Your own team (or whoever you hire) stands up a small bridge service that talks to your real payment processor — we only ever call this fixed contract.",
    weCall: [
      {
        method: "POST",
        path: "/checkout",
        body: '{ "orderId": "ord_123", "amountMinor": 34900, "currency": "AED", "returnUrl": "https://..." }',
        response: '{ "checkoutUrl": "https://your-processor.com/pay/...", "ref": "your-own-reference" }',
      },
      {
        method: "GET",
        path: "/status/{ref}",
        body: "—",
        response: '{ "status": "pending" | "authorized" | "captured" | "failed" | "refunded" }',
      },
      {
        method: "POST",
        path: "/refund",
        body: '{ "ref": "your-own-reference", "amountMinor": 34900, "currency": "AED" }',
        response: '{ "status": "refunded" }',
      },
    ],
    theyCall: { body: '{ "orderId": "ord_123", "status": "captured", "ref": "your-own-reference" }' },
  },
  delivery: {
    title: "Delivery",
    intro: "Courier booking runs through your own delivery integration — your bridge service talks to your real courier account; we only ever call this fixed contract.",
    weCall: [
      {
        method: "POST",
        path: "/book",
        body: '{ "orderId": "ord_123", "address": "The Greens, Dubai" }',
        response: '{ "trackingRef": "your-own-reference" }',
      },
      {
        method: "GET",
        path: "/status/{trackingRef}",
        body: "—",
        response: '{ "status": "pending" | "booked" | "in_transit" | "delivered" | "failed" }',
      },
    ],
    theyCall: { body: '{ "orderId": "ord_123", "status": "in_transit", "trackingRef": "your-own-reference" }' },
  },
};

/**
 * Screen 06's Payments/Delivery tabs — "bring your own integration". This
 * is the whole self-service story: a form to enter the brand's endpoint
 * + key, and the exact HTTP contract (request/response shapes, webhook
 * shape) their developer needs to implement — no OAuth, no Saleis.live
 * engineering work per processor/courier. Requests go through
 * apps/api/src/lib/httpAdapters.ts; the webhook side is
 * apps/api/src/routes/webhooks.ts — keep this copy in sync with both.
 */
function IntegrationPanel({
  kind,
  brandId,
  integration,
  onUpdated,
}: {
  kind: "payment" | "delivery";
  brandId: string;
  integration: HttpIntegrationConfig | null;
  onUpdated: (brand: Brand) => void;
}) {
  const copy = INTEGRATION_COPY[kind];
  const [endpointUrl, setEndpointUrl] = useState(integration?.endpointUrl ?? "");
  const [apiKey, setApiKey] = useState(integration?.apiKey ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(!integration?.connected);
  const [revealSecret, setRevealSecret] = useState(false);

  const webhookUrl = `${apiClient.baseUrl}/api/webhooks/${kind}/${brandId}`;

  const onConnect = async () => {
    if (!endpointUrl.trim() || !apiKey.trim()) {
      setError("Endpoint URL and API key are both required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const brand = await apiClient.updateBrandIntegration(brandId, kind, { endpointUrl: endpointUrl.trim(), apiKey: apiKey.trim() });
      onUpdated(brand);
      setShowGuide(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect.");
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const brand = await apiClient.updateBrandIntegration(brandId, kind, null);
      onUpdated(brand);
      setEndpointUrl("");
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...styles.sectionCard, maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 8 }}>{copy.title}</h2>
        {integration?.connected ? (
          <span style={{ ...styles.pill, background: colors.success, color: colors.white, fontSize: 11 }}>Connected</span>
        ) : (
          <span style={{ ...styles.pill, background: colors.background, color: colors.muted, fontSize: 11 }}>Not connected</span>
        )}
      </div>
      <p style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>{copy.intro}</p>

      {integration?.connected ? (
        <div style={{ background: colors.background, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12 }}>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Your endpoint:</strong> {integration.endpointUrl}
          </p>
          <p style={{ margin: "0 0 4px", wordBreak: "break-all" }}>
            <strong>Webhook URL to call us on:</strong> {webhookUrl}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Webhook secret</strong> (send as <code>X-Webhook-Secret</code>):{" "}
            {revealSecret ? integration.webhookSecret : "•".repeat(16)}{" "}
            <button type="button" onClick={() => setRevealSecret((v) => !v)} style={{ ...styles.linkButton, fontSize: 12 }}>
              {revealSecret ? "Hide" : "Reveal"}
            </button>
          </p>
        </div>
      ) : null}

      <label style={styles.label}>Endpoint URL</label>
      <input style={styles.input} value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://your-bridge-service.example.com" />
      <label style={styles.label}>API key</label>
      <input style={styles.input} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="The key your bridge service expects from us" />

      {error ? <p style={styles.error}>{error}</p> : null}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        {integration?.connected ? (
          <button type="button" style={{ ...styles.button, ...styles.buttonAuto, background: colors.white, color: colors.ink, border: `1px solid ${colors.border}` }} disabled={busy} onClick={onDisconnect}>
            Disconnect
          </button>
        ) : null}
        <button style={{ ...styles.button, ...styles.buttonAuto, opacity: busy ? 0.4 : 1 }} disabled={busy} onClick={onConnect}>
          {busy ? "Saving…" : integration?.connected ? "Update" : "Connect"}
        </button>
      </div>

      <button type="button" onClick={() => setShowGuide((v) => !v)} style={{ ...styles.linkButton, fontSize: 13, marginTop: 20 }}>
        {showGuide ? "Hide integration guide" : "Show integration guide (for your developer)"}
      </button>

      {showGuide ? (
        <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.6 }}>
          <p style={{ fontWeight: 700, margin: "12px 0 4px" }}>We call your endpoint:</p>
          {copy.weCall.map((call) => (
            <div key={call.path} style={{ background: colors.background, borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <p style={{ margin: "0 0 4px", fontFamily: "monospace" }}>
                {call.method} {"{endpointUrl}"}
                {call.path}
              </p>
              {call.body !== "—" ? <p style={{ margin: "0 0 4px", fontFamily: "monospace", color: colors.muted, wordBreak: "break-all" }}>Body: {call.body}</p> : null}
              <p style={{ margin: 0, fontFamily: "monospace", color: colors.muted, wordBreak: "break-all" }}>Response: {call.response}</p>
            </div>
          ))}
          <p style={{ fontWeight: 700, margin: "12px 0 4px" }}>Your service calls us back (status changes):</p>
          <div style={{ background: colors.background, borderRadius: 8, padding: 10 }}>
            <p style={{ margin: "0 0 4px", fontFamily: "monospace", wordBreak: "break-all" }}>POST {webhookUrl}</p>
            <p style={{ margin: "0 0 4px", fontFamily: "monospace", color: colors.muted }}>Header: X-Webhook-Secret: {"{your webhook secret above}"}</p>
            <p style={{ margin: 0, fontFamily: "monospace", color: colors.muted, wordBreak: "break-all" }}>Body: {copy.theyCall.body}</p>
          </div>
          <p style={{ color: colors.muted, marginTop: 8 }}>Auth on our side calls to you: we send your API key as an HTTP Bearer token. Every request/response is plain JSON — no SDK required.</p>
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
  const [removingId, setRemovingId] = useState<string | null>(null);
  const resolveImg = (url: string) => (url.startsWith("http") ? url : apiClient.resolveAssetUrl(url));

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
  // Short description is optional (Ola, 2026-08-12: "not everyone will want it") — only the headline actually gates readiness.
  const storeReady = !!campaign.headline;
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
    { label: "Store copy", ready: storeReady, note: storeReady ? "Ready" : "Missing headline" },
    { label: "Policies", ready: policiesReady, note: policiesReady ? "Ready" : "Missing return or shipping policy" },
  ];

  const onRemoveFromSale = async (p: Product) => {
    if (!campaign) return;
    if (!window.confirm(`Remove "${p.name.value || "this product"}" from the sale? This can't be undone from here — you'd need to add it back.`)) return;
    setRemovingId(p.id);
    setError(null);
    try {
      const updated = await apiClient.updateCampaign(campaign.id, { productIds: campaign.productIds.filter((id) => id !== p.id) });
      setCampaign(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that product.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div>
      <div>
        <h1 style={styles.h1}>Go live</h1>
        <p style={styles.sub}>Final check before the sale goes live. Until then, your store is only visible to you.</p>
      </div>
      <hr style={styles.divider} />

      <div style={{ ...styles.sectionCard, marginBottom: 24 }}>
        <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 4 }}>Your sale, at a glance</h2>
        <p style={{ ...styles.sub, marginBottom: 16 }}>Click a product to fix it. Use the × to drop it from this sale.</p>
        {selectedProducts.length === 0 ? (
          <p style={styles.sub}>No products in this sale yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {selectedProducts.map((p) => {
              const mainImage = p.images.find((i) => i.isMain) ?? p.images[0];
              const badge = productStatusBadge(p);
              const issues = describeProductIssues(p);
              return (
                <div
                  key={p.id}
                  style={{ position: "relative", border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden", cursor: "pointer", background: colors.white, opacity: removingId === p.id ? 0.5 : 1 }}
                  onClick={() => {
                    window.location.hash = `#/products/${p.id}`;
                  }}
                >
                  <button
                    type="button"
                    aria-label="Remove from sale"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFromSale(p);
                    }}
                    disabled={!!removingId}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: "none",
                      background: "rgba(0,0,0,0.55)",
                      color: colors.white,
                      fontSize: 13,
                      lineHeight: "22px",
                      textAlign: "center",
                      padding: 0,
                      cursor: "pointer",
                      zIndex: 1,
                    }}
                  >
                    ×
                  </button>
                  <div style={{ width: "100%", aspectRatio: "1 / 1", background: colors.background, ...CHECKERBOARD_BG }}>
                    {mainImage ? <img src={resolveImg(mainImage.url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                  </div>
                  <div style={{ padding: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name.value || "Untitled product"}</p>
                    <p style={{ fontSize: 12, color: colors.muted, margin: "0 0 6px" }}>{formatChange(p.price)}</p>
                    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, borderRadius: 4, padding: "2px 6px" }}>{badge.label}</span>
                    {issues.length > 0 ? <p style={{ fontSize: 10, color: colors.error, margin: "4px 0 0" }}>{issues.join(" · ")}</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ ...styles.sectionCard, flex: 1, minWidth: 320 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 16 }}>See your actual storefront</h2>
          <p style={{ ...styles.sub, marginBottom: 16 }}>
            Not public yet — this link only works for you, signed in. It's the real store: your products, headline, colours and everything else you've set up so far.
          </p>
          <a
            href={resolveStorefrontPreviewUrl(brand.slug, window.localStorage.getItem(AUTH_TOKEN_KEY))}
            target="_blank"
            rel="noreferrer"
            style={{ ...styles.button, ...styles.buttonAuto, display: "inline-block", textDecoration: "none", textAlign: "center" }}
          >
            Open your store →
          </a>
          <p style={{ fontSize: 12, color: colors.muted, marginTop: 12 }}>
            Adapts automatically to phone screens — open the same link on your phone, or resize this browser window, to check the mobile layout.
          </p>
          <p style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
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
  loginRoot: { minHeight: "100vh", background: colors.ivory, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: typography.fontFamily.ui },
  loginCard: { width: "100%", maxWidth: 360, background: colors.paper, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 32, boxSizing: "border-box" },
  topbar: {
    height: 70,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 28px",
    background: colors.paper,
    borderBottom: `1px solid ${colors.line}`,
  },
  wizardNextRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 32, paddingTop: 24, borderTop: `1px solid ${colors.line}` },
  setupBar: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: colors.bluepale, borderBottom: `1px solid ${colors.line}` },
  setupBarDots: { display: "flex", gap: 4, flexShrink: 0 },
  setupDot: { width: 8, height: 8, borderRadius: 999, background: colors.stone },
  setupDotDone: { background: colors.success },
  setupDotCurrent: { background: colors.navy },
  setupBarText: { fontSize: 12, flex: "1 1 200px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  setupBarActions: { display: "flex", gap: 8, flexShrink: 0 },
  setupBtnPrimary: { fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: "none", background: colors.navy, color: colors.white, cursor: "pointer" },
  setupBtnGhost: { fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: `1px solid ${colors.line}`, background: "transparent", color: colors.muted, cursor: "pointer" },
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
  noticeBox: { background: colors.bluepale, border: `1px solid ${colors.line}`, borderRadius: 10, padding: "12px 16px", fontSize: 13, marginBottom: 16 },
  teamTable: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  teamTh: { textAlign: "left", fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, padding: "0 0 12px", borderBottom: `1px solid ${colors.line}` },
  teamTd: { padding: "12px 12px 12px 0", borderBottom: `1px solid ${colors.line}`, verticalAlign: "middle" },
  teamRoleSelect: { fontSize: 12, padding: "6px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.white, fontFamily: "inherit" },

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
  linkButton: { background: "none", border: "none", padding: 0, color: colors.navy, fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
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
