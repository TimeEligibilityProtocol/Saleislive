import { colors, typography } from "@saleis-live/ui";
import {
  Brand,
  BrandMembership,
  Campaign,
  CampaignAccess,
  FulfilmentStatus,
  HttpIntegrationConfig,
  ImportBatch,
  ImportRowDiff,
  isProductReadyToPublish,
  Order,
  OrderStatus,
  ParsedImportRow,
  Product,
  Role,
  ThemePresetId,
  User,
} from "@saleis-live/domain";
import { ApiError, ImportPreview, SetupStepKey, SetupStepView, TeamMemberView } from "@saleis-live/api-client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Logo } from "./components/Logo";
import { apiClient, AUTH_TOKEN_KEY, resolveCatalogueExportUrl, resolveStorefrontPreviewUrl } from "./config/apiClient";

const ROOT_DOMAIN = "saleis.live";
const DEMO_TENANT_ID = "t_demo";

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
  { label: "Check your products", route: "#/catalogue-center" },
  { label: "Set up your sale", route: "#/launch-studio" },
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
  group_owner: ["New brand", "Team", "Add your stock", "Check your products", "Set up your sale", "Go live", "Orders", "Dashboard", "Store"],
  brand_admin: ["New brand", "Team", "Add your stock", "Check your products", "Set up your sale", "Go live", "Orders", "Dashboard", "Store"],
  merchandiser: ["Add your stock", "Check your products", "Set up your sale", "Go live"],
  order_manager: ["Orders"],
  analyst: ["Dashboard"],
  read_only: ["New brand", "Team", "Add your stock", "Check your products", "Set up your sale", "Go live", "Orders", "Dashboard", "Store"],
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

  const logout = () => {
    apiClient.logout().catch(() => {});
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
    setMemberships([]);
  };

  return { loading, user, memberships, login, logout };
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
function LoginPage({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
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
      </div>
    </div>
  );
}

export function App() {
  const hash = useHashRoute();
  const auth = useAuth();

  if (auth.loading) {
    return <div style={styles.loginRoot} />;
  }

  if (!auth.user) {
    return <LoginPage onLogin={auth.login} />;
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
    return { active: "Check your products", stepKey: "ai_catalogue_review", page: <ProductStudioPage productId={productId} /> };
  }
  if (hash === "#/catalogue-center") return { active: "Check your products", stepKey: "ai_catalogue_review", page: <CatalogueCenterPage /> };
  if (hash === "#/launch-studio") return { active: "Set up your sale", stepKey: "launch_setup", page: <LaunchStudioPage /> };
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
  ai_catalogue_review: "Check your products",
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

  if (!steps) return null;
  const currentIndex = steps.findIndex((s) => s.status !== "approved");
  if (currentIndex === -1) return null;
  const current = steps[currentIndex];
  const role = auth.memberships.find((m) => m.brandId === brandId)?.role ?? null;
  const canApprove = role === "brand_admin" || role === "group_owner";

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
        {current.status === "submitted" ? <span style={{ color: colors.warning }}> · waiting for approval</span> : null}
        {current.status === "rejected" && current.note ? <span style={{ color: colors.error }}> · rejected: {current.note}</span> : null}
      </div>
      <div style={styles.setupBarActions}>
        {current.status === "submitted" && canApprove ? (
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
    setInviting(true);
    try {
      const password = generateTempPassword();
      const email = inviteEmail.trim();
      await apiClient.inviteTeamMember({ email, displayName: inviteName.trim(), password, brandId, role: inviteRole, tenantId: DEMO_TENANT_ID });
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

function AddStockPage() {
  const [brandId] = useState(() => window.localStorage.getItem(LAST_BRAND_ID_KEY) ?? "b_demo");
  const [brandSlug] = useState(() => window.localStorage.getItem(LAST_BRAND_SLUG_KEY));
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
  const [manualSize, setManualSize] = useState("");
  const [manualDimensions, setManualDimensions] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualStock, setManualStock] = useState("");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualSaved, setManualSaved] = useState<Product | null>(null);

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

  const onManualSubmit = async () => {
    if (!manualSku.trim()) return;
    setManualSubmitting(true);
    setError(null);
    try {
      const product = await apiClient.createManualProduct(brandId, {
        sku: manualSku.trim(),
        name: manualName || undefined,
        category: manualCategory || undefined,
        size: manualSize || undefined,
        dimensions: manualDimensions || undefined,
        price: manualPrice || undefined,
        stock: manualStock || undefined,
        imageUrl: manualImageUrl || undefined,
      });
      setManualSaved(product);
      setManualSku("");
      setManualName("");
      setManualCategory("");
      setManualSize("");
      setManualDimensions("");
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
          <a href={resolveStorefrontPreviewUrl(brandSlug)} target="_blank" rel="noreferrer" style={styles.previewLink}>
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

      <div style={{ ...styles.sectionCard, marginTop: 24 }}>
          <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 4 }}>Add one product by hand</h2>
          <p style={{ ...styles.sub, marginBottom: 12 }}>For a single item, or to fix one thing without redoing the whole file.</p>
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
              <label style={styles.label}>Size</label>
              <input style={styles.input} value={manualSize} onChange={(e) => setManualSize(e.target.value)} placeholder="e.g. S/M, 37–41" />
            </div>
            <div>
              <label style={styles.label}>Dimensions</label>
              <input style={styles.input} value={manualDimensions} onChange={(e) => setManualDimensions(e.target.value)} placeholder="e.g. 30 x 20 x 10 cm" />
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

      <div style={{ ...styles.sectionCard, marginTop: 24 }}>
        <h2 style={{ ...styles.h1, fontSize: 16, marginBottom: 4 }}>Upload photos</h2>
        <p style={{ ...styles.sub, marginBottom: 12 }}>No spreadsheet — just photos, from a folder or your phone. Each one becomes a draft product; AI fills in what it can see. You still set price and stock afterward.</p>
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
              set price and stock in Check your products →
            </a>
          </p>
        ) : null}
      </div>

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
      <WizardNextButton stepKey="stock_intake" />
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
  const [size, setSize] = useState("");
  const [material, setMaterial] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stock, setStock] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNotConfigured, setAiNotConfigured] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [presets, setPresets] = useState<string[]>([]);
  const [preset, setPreset] = useState<string>("white");
  const [removingBg, setRemovingBg] = useState(false);
  const [applyingBg, setApplyingBg] = useState(false);

  useEffect(() => {
    apiClient
      .listBackgroundPresets()
      .then((p) => {
        setPresets(p);
        if (p.length > 0) setPreset(p[0]);
      })
      .catch(() => setPresets([]));
  }, []);

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
        size,
        material,
        dimensions,
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

  // Acts on whichever photo is currently main — click a thumbnail below to make a different one main first.
  const targetPhotoUrl = () => product?.images.find((i) => i.isMain)?.url ?? product?.images[0]?.url ?? null;

  const onRemoveBackground = async () => {
    if (!product) return;
    const url = targetPhotoUrl();
    if (!url) return;
    setRemovingBg(true);
    setPhotoError(null);
    try {
      setProduct(await apiClient.removeImageBackground(brandId, productId, url));
    } catch (err) {
      setPhotoError(err instanceof ApiError && err.status === 422 ? "Couldn't find a clear product in that photo — try a different one." : "Background removal failed.");
    } finally {
      setRemovingBg(false);
    }
  };

  const onApplyBackground = async () => {
    if (!product) return;
    const url = targetPhotoUrl();
    if (!url) return;
    setApplyingBg(true);
    setPhotoError(null);
    try {
      setProduct(await apiClient.applyBackgroundPreset(brandId, productId, url, preset));
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
        ← Back to Check your products
      </a>
      <h1 style={styles.h1}>Product Studio</h1>
      <p style={styles.sub}>Edit one product, its images, copy and variants.</p>
      <hr style={styles.divider} />

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ ...styles.sectionCard, width: 260, flexShrink: 0 }}>
          <h2 style={{ ...styles.h1, fontSize: 15, marginBottom: 16 }}>Product media</h2>
          {mainImage ? (
            // objectFit: "contain" (not "cover") — shows the whole photo, never crops it; the box just letterboxes around whatever shape the photo is.
            <img src={resolveImg(mainImage.url)} alt={mainImage.alt} style={{ width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 10, background: colors.background }} />
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
                      background: colors.white,
                      cursor: "pointer",
                      overflow: "hidden",
                    }}
                  >
                    <img src={resolveImg(img.url)} alt={img.alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
          {photoError ? <p style={{ ...styles.error, marginTop: 8 }}>{photoError}</p> : null}

          <hr style={{ ...styles.divider, margin: "16px 0" }} />
          <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px" }}>Photo tools — acts on the main photo above</p>
          <button
            type="button"
            disabled={removingBg || !mainImage}
            onClick={() => void onRemoveBackground()}
            style={{ ...styles.button, ...styles.buttonAuto, width: "100%", background: colors.white, color: colors.ink, border: `1px solid ${colors.border}`, opacity: removingBg || !mainImage ? 0.5 : 1 }}
          >
            {removingBg ? "Removing background…" : "Remove background"}
          </button>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <select style={{ ...styles.input, padding: "8px 10px", fontSize: 12 }} value={preset} onChange={(e) => setPreset(e.target.value)}>
              {presets.map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)} background
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={applyingBg || !mainImage || presets.length === 0}
              onClick={() => void onApplyBackground()}
              style={{ ...styles.button, ...styles.buttonAuto, opacity: applyingBg || !mainImage ? 0.5 : 1 }}
            >
              {applyingBg ? "Applying…" : "Apply"}
            </button>
          </div>
          <p style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>
            Both add a new photo to the gallery above rather than replacing the original — pick "Remove background" first, then set that cutout as main before applying a background to it.
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
          <h1 style={styles.h1}>Check your products</h1>
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
                  const missingPhotoRow = p.images.length === 0;
                  return (
                    <tr key={p.id}>
                      <td style={styles.td}>{p.name.value ?? "—"}</td>
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

  const relevant = (batches ?? []).filter((b) => b.fileName);
  if (batches !== null && relevant.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ ...styles.h1, fontSize: 18 }}>Import history</h2>
      <p style={styles.sub}>Uploaded the wrong file? Undo it here — it only affects what that import actually changed.</p>
      {notice && <p style={{ fontSize: 13, color: colors.success }}>{notice}</p>}
      {batches === null ? (
        <p style={styles.sub}>Loading…</p>
      ) : (
        <div style={styles.sectionCard}>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>File</th>
                  <th style={styles.th}>Uploaded</th>
                  <th style={styles.th}>Rows</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {relevant.map((b) => (
                  <tr key={b.id}>
                    <td style={styles.td}>{b.fileName}</td>
                    <td style={styles.td}>{new Date(b.createdAt).toLocaleString()}</td>
                    <td style={styles.td}>{b.rows.length}</td>
                    <td style={styles.td}>{b.status === "committed" ? "Applied" : b.status === "rolled_back" ? "Undone" : "Staged"}</td>
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
        </div>
      )}
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
  const [brand, setBrand] = useState<Brand | null>(null);
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
          <h1 style={styles.h1}>Set up your sale</h1>
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

      {tab === "payments" ? <IntegrationPanel kind="payment" brandId={brandId} integration={brand?.paymentIntegration ?? null} onUpdated={setBrand} /> : null}

      {tab === "delivery" ? <IntegrationPanel kind="delivery" brandId={brandId} integration={brand?.deliveryIntegration ?? null} onUpdated={setBrand} /> : null}

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
      <h1 style={styles.h1}>Go live</h1>
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
