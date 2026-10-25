export interface Env {
  DB: D1Database;
  /** Secrets (wrangler pages secret put / .dev.vars). Never committed. */
  BOT_TOKEN?: string;
  WEBHOOK_SECRET?: string;
  ADMIN_IDS?: string; // comma-separated Telegram user ids
  OWNER_CHAT_ID?: string; // chat that receives booking notifications
  /** Plain vars (wrangler.toml). */
  MINI_APP_URL?: string;
  TELEGRAM_API_BASE?: string; // default https://api.telegram.org — tests point it at a local stub
  INITDATA_MAX_AGE_SEC?: string; // default 86400
  RATE_LIMIT_READS_PER_MIN?: string; // default 120
  RATE_LIMIT_WRITES_PER_MIN?: string; // default 20
}
