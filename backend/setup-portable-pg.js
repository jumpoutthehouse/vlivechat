const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const baseDir = path.join(__dirname);
const pgDir = path.join(baseDir, "pgsql");
const dataDir = path.join(pgDir, "data");
const binDir = path.join(pgDir, "bin");

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: baseDir });
}

async function setup() {
  console.log("=== Setting up Portable PostgreSQL ===");

  if (!fs.existsSync(dataDir)) {
    console.log("[1/4] Initializing database cluster (initdb)...");
    run(`"${path.join(binDir, "initdb.exe")}" -U postgres -A trust -D "${dataDir}" --encoding=UTF8`);
  } else {
    console.log("[1/4] Database cluster already initialized.");
  }

  console.log("[2/4] Starting PostgreSQL server...");
  try {
    run(`"${path.join(binDir, "pg_ctl.exe")}" -D "${dataDir}" -l "${path.join(pgDir, "logfile")}" start`);
  } catch (err) {
    console.log("pg_ctl start message:", err.message);
  }

  // Wait 2 seconds for server to bind
  await new Promise(r => setTimeout(r, 2000));

  console.log("[3/4] Creating database and user...");
  try {
    run(`"${path.join(binDir, "createdb.exe")}" -U postgres vlivechat`);
  } catch (e) {
    console.log("createdb note (may already exist):", e.message);
  }

  try {
    run(`"${path.join(binDir, "createuser.exe")}" -U postgres vlcuser`);
  } catch (e) {
    console.log("createuser note (may already exist):", e.message);
  }

  try {
    run(`"${path.join(binDir, "psql.exe")}" -U postgres -c "ALTER USER vlcuser WITH PASSWORD 'vlcpassword123'; GRANT ALL PRIVILEGES ON DATABASE vlivechat TO vlcuser; ALTER DATABASE vlivechat OWNER TO vlcuser; GRANT ALL ON SCHEMA public TO vlcuser;"`);
  } catch (e) {
    console.log("psql alter user note:", e.message);
  }

  console.log("[4/4] Running schema migrations & seeds...");
  run(`node src/db/migrate.js`);

  console.log("\n==========================================");
  console.log(" PostgreSQL & DB Setup Complete!");
  console.log("==========================================\n");
}

setup().catch(console.error);
