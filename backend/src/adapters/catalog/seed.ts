// Standalone seed: run Door-1 fetch once (npm run seed). Also runnable via the API.
import { syncCatalog } from '../../application/catalog.js';
import { pool } from '../db/pool.js';

syncCatalog()
  .then((r) => {
    console.log(`seeded ${r.synced} products`);
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
