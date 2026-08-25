import type { NextFunction, Request, Response } from 'express';

// Minimal fixed-window in-memory rate limiter for sensitive endpoints
// (auth, payment). Good enough for a single-node hackathon build; swap for
// Redis-backed limiting when horizontally scaled.
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = (opts.key?.(req) ?? req.ip ?? 'anon') + ':' + req.path;
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || rec.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }
    if (rec.count >= opts.max) {
      res.status(429).json({ error: 'too many requests — slow down' });
      return;
    }
    rec.count += 1;
    next();
  };
}
