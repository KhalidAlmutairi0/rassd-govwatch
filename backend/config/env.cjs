const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
try { process.loadEnvFile(path.join(root, ".env")); }
catch (error) { if (error.code !== "ENOENT") throw error; }

const data = path.resolve(root, process.env.DATA_DIR || "data");
const database = process.env.DATABASE_URL || `file:${path.join(data, "rasd.db")}`;
if (!database.startsWith("file:")) throw new Error("DATABASE_URL must reference a SQLite file");
const separator = database.indexOf("?");
const filename = database.slice(5, separator < 0 ? undefined : separator);
const query = separator < 0 ? "" : database.slice(separator);
const databasePath = path.resolve(root, "prisma", decodeURIComponent(filename));
process.env.DATABASE_URL = `file:${databasePath}${query}`;
process.env.ARTIFACTS_DIR = path.resolve(root, process.env.ARTIFACTS_DIR || path.join(data, "artifacts"));
process.env.FRONTEND_ORIGINS ||= "http://localhost:3000,http://127.0.0.1:3000";
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(process.env.ARTIFACTS_DIR, { recursive: true });

module.exports = { root, databasePath };
