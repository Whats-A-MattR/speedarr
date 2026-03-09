// Migration 0004: gluetun_status table for Gluetun health and public IP history

/**
 * @param {import('better-sqlite3').Database} db
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gluetun_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      public_ip TEXT,
      vpn_status TEXT NOT NULL,
      city TEXT,
      region TEXT,
      country TEXT,
      raw_publicip TEXT,
      raw_openvpn_status TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_gluetun_status_timestamp ON gluetun_status(timestamp DESC);
  `);
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function down(db) {
  db.exec('DROP TABLE IF EXISTS gluetun_status');
}

module.exports = { up, down };
