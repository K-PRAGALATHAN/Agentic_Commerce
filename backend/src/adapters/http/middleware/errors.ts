import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../../../application/auth.js';

// Wrap async route handlers so thrown errors reach the error middleware.
export function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

// Central error handler — every failure returns a clean JSON shape, never a stack.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Multer rejects oversized uploads with its own error code; without this it
  // would surface as a bare 500 instead of a message the merchant can act on.
  if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'image is too large (max 2 MB)' });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation failed', details: err.issues });
    return;
  }
  console.error('unhandled error:', err);
  res.status(500).json({ error: 'internal error' });
}
