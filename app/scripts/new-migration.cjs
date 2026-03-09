#!/usr/bin/env node

// Helper to scaffold a new migration file under migrations/
// Usage:
//   npm run db:new -- add-agent-location
//   pnpm db:new add-agent-location

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/new-migration.cjs <name>');
    process.exit(1);
  }

  const rawName = args.join('-').toLowerCase();
  const safeName = rawName.replace(/[^a-z0-9_-]+/g, '-');

  const migrationsDir = path.join(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  const existing = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_/.test(f))
    .sort();

  let next = 1;
  if (existing.length > 0) {
    const last = existing[existing.length - 1];
    const match = /^(\d+)_/.exec(last);
    if (match) {
      next = parseInt(match[1], 10) + 1;
    }
  }

  const prefix = String(next).padStart(4, '0');
  const filename = `${prefix}_${safeName}.cjs`;
  const fullPath = path.join(migrationsDir, filename);

  if (fs.existsSync(fullPath)) {
    console.error(`Migration file already exists: ${fullPath}`);
    process.exit(1);
  }

  const template = `// Migration ${prefix}_${safeName}

/**
 * @param {import('better-sqlite3').Database} db
 */
function up(db) {
  // TODO: implement schema changes
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function down(db) {
  // TODO: implement rollback for this migration
}

module.exports = { up, down };
`;

  fs.writeFileSync(fullPath, template, { encoding: 'utf8' });
  console.log('Created migration:', path.relative(process.cwd(), fullPath));
}

main();

