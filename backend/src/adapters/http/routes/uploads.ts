import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../../../config/env.js';
import { HttpError } from '../../../application/auth.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

// Product image upload. Merchant-only, and the ONLY place files enter the server.
export const uploadsRouter = Router();
const merchantOnly = [requireAuth, requireRole('merchant', 'admin')] as const;

// An unbounded write endpoint is a disk-fill vector, so it is throttled too.
const uploadLimit = rateLimit({ windowMs: 60_000, max: 30 });

// Extension comes from the MIME type, never from the client's filename.
const EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

mkdirSync(config.uploads.dir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploads.dir),
    // A server-generated UUID name closes path traversal via originalname.
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXT[file.mimetype]}`),
  }),
  limits: { fileSize: config.uploads.maxBytes, files: 1 },
  fileFilter: (_req, file, cb) =>
    EXT[file.mimetype]
      ? cb(null, true)
      : cb(new HttpError(400, 'PNG, JPEG, WebP or GIF only')),
});

uploadsRouter.post(
  '/merchant/uploads',
  ...merchantOnly,
  uploadLimit,
  upload.single('file'),
  (req, res) => {
    if (!req.file) throw new HttpError(400, 'no file uploaded');
    // Relative URL, so it works unchanged in dev, Docker and behind a proxy.
    res.json({ url: `/uploads/${req.file.filename}` });
  },
);
