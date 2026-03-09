// Migration 0005: copy settings table to config.json for new config-file backend.
// If config.json already exists, skip. Otherwise copy so upgrades keep their settings.

const path = require('path');
const fs = require('fs');

/**
 * @param {import('better-sqlite3').Database} db
 */
function up(db) {
  const dataDir =
    process.env.SPEEDARR_DATA_DIR ||
    process.env.CONFIG_PATH ||
    path.join(process.cwd(), '.speedarr');
  const configPath = path.join(dataDir.replace(/\/$/, ''), 'config.json');
  if (fs.existsSync(configPath)) return;

  let rows = [];
  try {
    rows = db.prepare('SELECT key, value FROM settings').all();
  } catch {
    return;
  }
  const data = {};
  for (const row of rows) {
    if (row && typeof row.key === 'string' && typeof row.value === 'string') {
      data[row.key] = row.value;
    }
  }
  if (Object.keys(data).length === 0) return;

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[speedarr] Could not write config.json:', err.message);
  }
}

function down() {
  // No-op: do not delete config.json on rollback
}

module.exports = { up, down };
