// Initial schema for Speedarr.
// This migration is idempotent and safe to run on existing databases.

/** @param {import('better-sqlite3')} _Database */

/**
 * @param {import('better-sqlite3').Database} db
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS speed_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      download_mbps REAL NOT NULL,
      upload_mbps REAL NOT NULL,
      latency_ms REAL,
      server_id TEXT,
      server_name TEXT,
      raw_json TEXT,
      agent_id TEXT DEFAULT 'local',
      agent_name TEXT DEFAULT 'Local'
    );

    CREATE INDEX IF NOT EXISTS idx_speed_results_timestamp ON speed_results(timestamp);
    CREATE INDEX IF NOT EXISTS idx_speed_results_agent_id ON speed_results(agent_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );
  `);

  // Ensure agent columns exist for older databases created before agent support.
  const tableInfo = db.prepare("PRAGMA table_info(speed_results)").all();
  const hasAgentId = tableInfo.some((c) => c.name === 'agent_id');
  if (!hasAgentId) {
    db.exec(`ALTER TABLE speed_results ADD COLUMN agent_id TEXT DEFAULT 'local'`);
    db.exec(`ALTER TABLE speed_results ADD COLUMN agent_name TEXT DEFAULT 'Local'`);
    db.exec(`UPDATE speed_results SET agent_id = 'local', agent_name = 'Local' WHERE agent_id IS NULL`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_speed_results_agent_id ON speed_results(agent_id)`);
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function down(db) {
  // For safety, do not drop tables on down; this is a no-op.
  // If you need to fully reset the DB, delete the file instead.
}

module.exports = { up, down };

