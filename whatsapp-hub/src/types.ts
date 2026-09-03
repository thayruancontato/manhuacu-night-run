export type Env = {
  DB: D1Database;
  HUB_STORAGE: KVNamespace;
  HUB_ASSETS: R2Bucket;
  OUTBOX: Queue<QueueMessagePayload>;
  OUTBOX_DLQ: Queue<QueueMessagePayload>;
  WHATSAPP_INSTANCE_DELAY_MS?: string;
  ADMIN_BOOTSTRAP_SECRET?: string;
};

export type Instance = {
  id: string;
  name: string;
  api_key_hash: string;
  api_key_prefix: string;
  rate_limit_per_minute: number;
  active: number;
};

export type WhatsAppNumber = {
  id: string;
  instance_id: string;
  label: string;
  role: "send" | "receive" | "both";
  evolution_base_url: string;
  evolution_api_key: string;
  evolution_instance_name: string;
  active: number;
};

export type MessageRow = {
  id: string;
  instance_id: string;
  number_id: string | null;
  template_id: string | null;
  to_phone: string;
  status: "pending" | "sent" | "failed" | "dead";
  require_image: number;
  attempts: number;
  max_attempts: number;
  payload: string;
  last_error: string | null;
};

/** Corpo que trafega pela Cloudflare Queue — só o essencial pra reprocessar sem reconsultar D1. */
export type QueueMessagePayload = {
  messageId: string;
  instanceId: string;
};
