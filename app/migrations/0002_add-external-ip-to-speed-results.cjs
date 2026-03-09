// Migration 0002_add-external-ip-to-speed-results

/**
 * @param {import('better-sqlite3').Database} db
 */
function up(db) {
  // TODO: implement schema changes
  const cols = db.prepare('PRAGMA table_info("speed_results")').all();
  const hasExternalIp = cols.some((col) => col.name === "external_ip");
  if (hasExternalIp) {
    return;
  }
  db.prepare("ALTER TABLE speed_results ADD COLUMN external_ip TEXT").run();
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function down(db) {
  // TODO: implement rollback for this migration
  db.prepare("ALTER TABLE speed_results DROP COLUMN external_ip").run();
}

module.exports = { up, down };
