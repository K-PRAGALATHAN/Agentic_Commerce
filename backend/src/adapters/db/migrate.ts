// Minimal migration runner: applies infra/migrations/*.sql in order, once each.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { pool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../../infra/migrations');

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM _migrations')).rows.map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= skip ${file}`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`+ applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`! failed ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }
  console.log('migrations done');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
