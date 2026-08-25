import type { NextFunction, Request, Response } from 'express';
import { verifyAccess, type TokenClaims } from '../../../application/auth.js';
import type { Role } from '../../../domain/types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenClaims;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }
  try {
    req.user = verifyAccess(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

// RBAC gate — e.g. requireRole('merchant') for catalog CRUD.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    if (!req.user.roles.some((r) => roles.includes(r))) {
      res.status(403).json({ error: `requires role: ${roles.join(' | ')}` });
      return;
    }
    next();
  };
}
