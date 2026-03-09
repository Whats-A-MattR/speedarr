// Migration 0003: nodes table for managing remote nodes

/**
 * @param {import('better-sqlite3').Database} db
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      blocked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_seen_at INTEGER,
      last_external_ip TEXT
    );
  `);
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function down(db) {
  db.exec('DROP TABLE IF EXISTS nodes');
}

module.exports = { up, down };
