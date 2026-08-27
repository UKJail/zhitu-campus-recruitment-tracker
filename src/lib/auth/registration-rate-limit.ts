type AttemptWindow = { count: number; resetAt: number };

const attempts = new Map<string, AttemptWindow>();
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 10;

function pruneExpired(now: number) {
  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key);
  }
}

export function registrationClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function consumeRegistrationAttempt(key: string, now = Date.now()) {
  pruneExpired(now);
  const current = attempts.get(key);
  if (!current) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRegistrationRateLimitForTests() {
  attempts.clear();
}
