import { createRequire } from "node:module";

const require = createRequire("/app/packages/database/package.json");
const { Client } = require("pg");

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const result = await client.query(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
      ) AS has_migrations,
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'User'
      ) AS has_users,
      (
        SELECT count(*)::int
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ) AS table_count
  `);

  const state = result.rows[0];
  const isLegacySchema =
    state?.has_migrations === false && state.has_users === true && state.table_count === 45;
  process.exit(isLegacySchema ? 0 : 1);
} catch {
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
