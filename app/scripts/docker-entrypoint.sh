#!/bin/sh
set -e
# Ensure data dir and db dir exist
export SPEEDARR_DATA_DIR="${SPEEDARR_DATA_DIR:-/config}"
mkdir -p "${SPEEDARR_DATA_DIR}/db"

# Node mode: merge env into config.json so agent id/name and API key are set
if [ "$MODE" = "node" ] || [ "$SPEEDARR_MODE" = "node" ]; then
  node -e '
    const fs = require("fs");
    const path = require("path");
    const dir = process.env.SPEEDARR_DATA_DIR || "/config";
    const configPath = path.join(dir, "config.json");
    let data = {};
    try { data = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch (e) {}
    if (process.env.SPEEDARR_AGENT_ID) data.SPEEDARR_AGENT_ID = process.env.SPEEDARR_AGENT_ID;
    if (process.env.SPEEDARR_AGENT_NAME) data.SPEEDARR_AGENT_NAME = process.env.SPEEDARR_AGENT_NAME;
    if (process.env.SPEEDARR_API_KEY) data.SPEEDARR_API_KEY = process.env.SPEEDARR_API_KEY;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  '
fi

exec "$@"
