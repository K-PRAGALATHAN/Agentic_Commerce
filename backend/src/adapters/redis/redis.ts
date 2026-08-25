import { Redis } from 'ioredis';
import { config } from '../../config/env.js';

export const redis = new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 3 });

// Phase 1: on login, warm hot state so conversational turns are fast.
export async function warmSession(userId: string, data: unknown): Promise<void> {
  try {
    await redis.set(`session:${userId}`, JSON.stringify(data), 'EX', 3600);
  } catch {
    // Redis is a cache, not the source of truth — never fail a request on it.
  }
}

export async function getSession(userId: string): Promise<unknown | null> {
  try {
    const raw = await redis.get(`session:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
