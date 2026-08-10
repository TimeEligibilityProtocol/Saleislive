/**
 * In-memory sliding-window limiter for login attempts — blueprint §11
 * ("Rate limiting, bot protection"). Keyed by email (not IP alone), so a
 * single account can't be brute-forced from many IPs and one IP hammering
 * many emails still gets slowed per-email. In-memory is fine for a single
 * API instance; if this ever runs multiple instances behind a load
 * balancer, this needs to move to the database or a shared cache instead.
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map<string, number[]>();

export function isLoginRateLimited(email: string): boolean {
  const key = email.toLowerCase();
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, recent);
  return recent.length >= MAX_ATTEMPTS;
}

export function recordLoginAttempt(email: string): void {
  const key = email.toLowerCase();
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
}

export function clearLoginAttempts(email: string): void {
  attempts.delete(email.toLowerCase());
}
