import { pool } from "./db.js";

// System-wide settings (migrations/1690000000065): a key's JSON value, its
// default when unset. Read on use - they change rarely and by a person.

export const SETTING_DEFAULTS = {
  // a project's pending migrations: "auto" - applied when the api starts;
  // "confirm" - they wait for a person (POST /dnp/migrations/apply)
  "dnp.migrations.apply": "auto" as "auto" | "confirm",
};
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const row = (await pool.query<{ value: (typeof SETTING_DEFAULTS)[K] }>("SELECT value FROM system_settings WHERE key = $1", [key])).rows[0];
  return row ? row.value : SETTING_DEFAULTS[key];
}

export async function setSetting<K extends SettingKey>(key: K, value: (typeof SETTING_DEFAULTS)[K], userId: number): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
    [key, JSON.stringify(value), userId],
  );
}
