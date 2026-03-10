// Migration 0005: track Gluetun status per configured service

/**
 * @param {import('better-sqlite3').Database} db
 */
function up(db) {
  const cols = db.prepare("PRAGMA table_info(gluetun_status)").all();
  const hasServiceId = cols.some((col) => col && col.name === 'service_id');
  if (!hasServiceId) {
    db.exec(`
      ALTER TABLE gluetun_status ADD COLUMN service_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_gluetun_status_service_timestamp
        ON gluetun_status(service_id, timestamp DESC);
    `);
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function down(db) {
  db.exec('DROP INDEX IF EXISTS idx_gluetun_status_service_timestamp');
}

module.exports = { up, down };
