import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { config } from "../config.js";

// The AI connections' API keys at rest (Service -> Config -> AI): AES-256-GCM
// with the master key AI_SECRETS_KEY from .env (sha-256 of it - any length
// / format of the env value works). Stored as "v1:<iv>:<tag>:<data>"
// (base64). The key never leaves the api - the routes only tell whether one
// is set. Without AI_SECRETS_KEY a key can't be saved (an error says so).

const VERSION = "v1";

function masterKey(): Buffer {
  if (!config.ai.secretsKey) throw new Error("AI_SECRETS_KEY is not set in .env - API keys can't be stored");
  return createHash("sha256").update(config.ai.secretsKey).digest();
}

export const secretsAvailable = (): boolean => Boolean(config.ai.secretsKey);

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
