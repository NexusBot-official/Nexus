const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Simple application-level encryption for sensitive text stored in SQLite.
// This provides "encryption at rest" for data in the DB file. The key is
// either provided via env or generated once and stored on disk.

const KEY_BYTES = 32; // 256‑bit AES key
const IV_BYTES = 12; // recommended size for AES-GCM
const KEY_FILE = path.join(__dirname, "..", "data", "secrets", "db_key");

let cachedKey = null;

function ensureKeyDir() {
  const dir = path.dirname(KEY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadKeyFromEnv() {
  const raw = process.env.DB_ENCRYPTION_KEY;
  if (!raw) return null;

  // Accept hex or base64
  try {
    let buf;
    if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === KEY_BYTES * 2) {
      buf = Buffer.from(raw, "hex");
    } else {
      buf = Buffer.from(raw, "base64");
    }
    if (buf.length !== KEY_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

function loadOrCreateKey() {
  if (cachedKey) return cachedKey;

  // 1) Prefer explicitly configured env key
  const envKey = loadKeyFromEnv();
  if (envKey) {
    cachedKey = envKey;
    return cachedKey;
  }

  // 2) Fallback to on-disk key (generated once)
  ensureKeyDir();
  if (fs.existsSync(KEY_FILE)) {
    try {
      const raw = fs.readFileSync(KEY_FILE, "utf8").trim();
      const buf = Buffer.from(raw, "hex");
      if (buf.length === KEY_BYTES) {
        cachedKey = buf;
        return cachedKey;
      }
    } catch {
      // fall through to regenerate
    }
  }

  // 3) Generate a new key and persist it
  const key = crypto.randomBytes(KEY_BYTES);
  try {
    fs.writeFileSync(KEY_FILE, key.toString("hex"), { mode: 0o600 });
  } catch {
    // If we can't write, we still proceed with in-memory key only.
  }
  cachedKey = key;
  return cachedKey;
}

function encryptText(plain) {
  if (plain === null || plain === undefined) return null;
  const text = String(plain);
  if (text.length === 0) return "";

  const key = loadOrCreateKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Store as base64(iv || tag || ciphertext)
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

function decryptText(payload) {
  if (payload === null || payload === undefined) return null;
  if (payload === "") return "";

  const key = loadOrCreateKey();

  try {
    const buf = Buffer.from(String(payload), "base64");
    if (buf.length <= IV_BYTES + 16) {
      // Not a valid encrypted payload, fall back to raw text
      return String(payload);
    }

    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(IV_BYTES, IV_BYTES + 16);
    const ciphertext = buf.subarray(IV_BYTES + 16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    // Old rows or non-encrypted data – return as-is so we don't break existing data
    return String(payload);
  }
}

module.exports = {
  encryptText,
  decryptText,
};
