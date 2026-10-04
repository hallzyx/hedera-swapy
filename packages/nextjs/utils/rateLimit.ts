export type RateLimiter = {
  /** Returns true when the key is still within its allowance for the current window. */
  allow: (key: string, now?: number) => boolean;
};

/**
 * Tiny fixed-window limiter kept in process memory. It protects a single server instance from
 * bursts; behind many serverless instances use a shared store (Redis, KV) instead.
 */
export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    allow(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || now >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        // Keep memory bounded: drop expired windows when the map grows.
        if (hits.size > 5000) {
          for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
        }
        return true;
      }
      if (entry.count >= max) return false;
      entry.count += 1;
      return true;
    },
  };
}
