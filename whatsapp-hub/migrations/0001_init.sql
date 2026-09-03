-- WhatsApp Hub — schema inicial
-- Isolamento multi-tenant: toda tabela filha carrega instance_id e nunca é lida sem esse filtro.

CREATE TABLE instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  api_key_prefix TEXT NOT NULL,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_instances_api_key_hash ON instances(api_key_hash);

-- Números de WhatsApp (chips Evolution API). Cada um pertence a exatamente uma instância.
CREATE TABLE whatsapp_numbers (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'both' CHECK (role IN ('send', 'receive', 'both')),
  evolution_base_url TEXT NOT NULL,
  evolution_api_key TEXT NOT NULL,
  evolution_instance_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (instance_id, evolution_instance_name)
);

CREATE INDEX idx_numbers_instance ON whatsapp_numbers(instance_id, active);

-- Fontes enviadas por upload (R2 guarda o binário; aqui só a referência).
CREATE TABLE fonts (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  family_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  original_filename TEXT,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_fonts_instance ON fonts(instance_id);

-- Templates de texto ou card. card_config e text_body guardam JSON/texto com merge fields
-- ({{chave}}) resolvidos contra o payload `data` livre enviado em cada mensagem.
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'card')),
  text_body TEXT,
  card_config TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (instance_id, name)
);

CREATE INDEX idx_templates_instance ON templates(instance_id);

-- Uma linha por mensagem enviada/enfileirada. `payload` guarda o JSON bruto recebido em /v1/messages.
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  number_id TEXT REFERENCES whatsapp_numbers(id),
  template_id TEXT REFERENCES templates(id),
  to_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  require_image INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  payload TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX idx_messages_instance_status ON messages(instance_id, status, created_at);

-- Trilha de auditoria por mensagem (uma tentativa = um evento).
CREATE TABLE message_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_message ON message_events(message_id);

-- Envios recorrentes. `recipients_mode` decide como o Hub descobre destinatários sem
-- conhecer o domínio da instância: lista embutida (`static`) ou webhook (`webhook_url`).
CREATE TABLE scheduled_jobs (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES templates(id),
  cron_expr TEXT NOT NULL,
  recipients_mode TEXT NOT NULL CHECK (recipients_mode IN ('static', 'webhook')),
  recipients_static TEXT,
  recipients_webhook_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jobs_instance ON scheduled_jobs(instance_id, active);
