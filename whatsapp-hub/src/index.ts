import { Hono, type Context, type Next } from "hono";
import { z } from "zod";
import type { Env, Instance, WhatsAppNumber, MessageRow, QueueMessagePayload } from "./types";
import { generateApiKey, hashApiKey, newId } from "./lib/auth";
import * as evo from "./lib/evolution";
import { renderCard, pngToDataUri, resolveMergeFields, type CardConfig } from "./lib/card";
import { logEvent, getMessage, getActiveNumbers } from "./lib/db";
import { cronMatches } from "./lib/cron";
import { DOCS_PAGE } from "./docs";

type EnqueueInput = {
  to: string;
  templateId?: string | null;
  text?: string | null;
  imageUrl?: string | null;
  data: Record<string, unknown>;
  requireImage: boolean;
  maxAttempts: number;
};

async function enqueueMessage(env: Env, instanceId: string, input: EnqueueInput): Promise<string> {
  const id = newId("msg");
  await env.DB.prepare(
    `INSERT INTO messages (id, instance_id, template_id, to_phone, require_image, max_attempts, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, instanceId, input.templateId || null, input.to, input.requireImage ? 1 : 0, input.maxAttempts, JSON.stringify(input))
    .run();
  await logEvent(env, id, "queued");

  const queuePayload: QueueMessagePayload = { messageId: id, instanceId };
  await env.OUTBOX.send(queuePayload);
  return id;
}

type Vars = { instance: Instance };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();

const QR_LIVE_PAGE = `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conectar WhatsApp</title>
<style>
  body { margin:0; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
         gap:20px; background:#071A45; color:#fff; font-family:system-ui,sans-serif; padding:24px; text-align:center; }
  h1 { font-size:1.1rem; margin:0; }
  #box { width:280px; height:280px; background:#fff; border-radius:16px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  #box img { width:100%; height:100%; object-fit:contain; }
  #status { font-size:0.85rem; color:#94a3b8; }
  #ok { display:none; font-size:1.4rem; color:#6BFF2A; font-weight:800; }
</style>
</head>
<body>
  <h1>Escaneie no WhatsApp &rarr; Aparelhos conectados</h1>
  <div id="box"><span id="status">Carregando QR...</span></div>
  <div id="ok">&#10003; Conectado!</div>
<script>
  const token = "__TOKEN__";
  let done = false;
  async function tick() {
    if (done) return;
    try {
      const res = await fetch("/qr-live/" + token + "/data", { cache: "no-store" });
      const data = await res.json();
      if (data.error) {
        document.getElementById("status").textContent = "Link expirado — peça um novo.";
        return;
      }
      if (data.state === "open") {
        done = true;
        document.getElementById("box").style.display = "none";
        document.getElementById("ok").style.display = "block";
        return;
      }
      if (data.qr) {
        document.getElementById("box").innerHTML = '<img src="' + data.qr + '" alt="QR code">';
      }
    } catch (e) {
      document.getElementById("status").textContent = "Erro ao atualizar, tentando de novo...";
    }
    setTimeout(tick, 15000);
  }
  tick();
</script>
</body>
</html>`;

app.get("/health", (c) => c.json({ ok: true, service: "whatsapp-hub" }));

// Documentação. Servida tanto em /docs (acessível hoje via workers.dev) quanto no path que vai
// virar o domínio público (thayruan.com.br/servico-whatsapp/automacao) — mesma rota Cloudflare
// entrega os dois, sem duplicar conteúdo.
app.get("/docs", (c) => c.html(DOCS_PAGE));
app.get("/servico-whatsapp/automacao", (c) => c.html(DOCS_PAGE));
app.get("/servico-whatsapp/automacao/", (c) => c.html(DOCS_PAGE));

app.onError((error, c) => {
  console.error("[whatsapp-hub] unhandled error", error);
  const message = String((error as any)?.message || error);
  const isConflict = message.includes("UNIQUE constraint failed");
  return c.json(
    { error: isConflict ? "already_exists" : "internal_error", details: message },
    isConflict ? 409 : 500
  );
});

// ---------------------------------------------------------------------------
// Bootstrap de instâncias (tenants). Não usa API key de instância — só o
// segredo de operador do serviço, porque criar um tenant é ato de quem opera
// o Hub, não de quem já é cliente dele.
// ---------------------------------------------------------------------------
const createInstanceSchema = z.object({
  name: z.string().min(2).max(120),
  rateLimitPerMinute: z.number().int().positive().max(6000).optional(),
});

app.post("/v1/instances", async (c) => {
  const secret = c.req.header("X-Bootstrap-Secret");
  if (!c.env.ADMIN_BOOTSTRAP_SECRET || secret !== c.env.ADMIN_BOOTSTRAP_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const parsed = createInstanceSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);

  const { plaintext, hash, prefix } = await generateApiKey();
  const id = newId("inst");
  await c.env.DB.prepare(
    "INSERT INTO instances (id, name, api_key_hash, api_key_prefix, rate_limit_per_minute) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, parsed.data.name, hash, prefix, parsed.data.rateLimitPerMinute || 60)
    .run();

  return c.json({ id, name: parsed.data.name, apiKey: plaintext, note: "Guarde essa chave agora — ela não pode ser recuperada depois, só rotacionada." }, 201);
});

// ---------------------------------------------------------------------------
// Autenticação por instância — tudo abaixo exige Authorization: Bearer <api key>
// ---------------------------------------------------------------------------
app.use("/v1/numbers/*", authMiddleware);
app.use("/v1/numbers", authMiddleware);
app.use("/v1/fonts/*", authMiddleware);
app.use("/v1/fonts", authMiddleware);
app.use("/v1/templates/*", authMiddleware);
app.use("/v1/templates", authMiddleware);
app.use("/v1/messages/*", authMiddleware);
app.use("/v1/messages", authMiddleware);
app.use("/v1/scheduled-jobs/*", authMiddleware);
app.use("/v1/scheduled-jobs", authMiddleware);

async function authMiddleware(c: Context<{ Bindings: Env; Variables: Vars }>, next: Next) {
  const header = c.req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return c.json({ error: "missing_api_key" }, 401);

  const hash = await hashApiKey(token);
  const instance = await c.env.DB.prepare("SELECT * FROM instances WHERE api_key_hash = ? AND active = 1").bind(hash).first<Instance>();
  if (!instance) return c.json({ error: "invalid_api_key" }, 401);

  c.set("instance", instance);
  await next();
}

// ---------------------------------------------------------------------------
// Números de WhatsApp
// ---------------------------------------------------------------------------
const createNumberSchema = z.object({
  label: z.string().min(1).max(80),
  role: z.enum(["send", "receive", "both"]).default("both"),
  evolutionBaseUrl: z.string().url(),
  evolutionApiKey: z.string().min(1),
  evolutionInstanceName: z.string().min(1).max(80),
});

app.post("/v1/numbers", async (c) => {
  const instance = c.get("instance");
  const parsed = createNumberSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);

  const id = newId("num");
  const number: WhatsAppNumber = {
    id,
    instance_id: instance.id,
    label: parsed.data.label,
    role: parsed.data.role,
    evolution_base_url: parsed.data.evolutionBaseUrl.replace(/\/$/, ""),
    evolution_api_key: parsed.data.evolutionApiKey,
    evolution_instance_name: parsed.data.evolutionInstanceName,
    active: 1,
  };

  await c.env.DB.prepare(
    "INSERT INTO whatsapp_numbers (id, instance_id, label, role, evolution_base_url, evolution_api_key, evolution_instance_name) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(number.id, number.instance_id, number.label, number.role, number.evolution_base_url, number.evolution_api_key, number.evolution_instance_name)
    .run();

  const created = await evo.createInstance(number).catch((error) => ({ ok: false, body: { error: String(error) } }));
  return c.json({ id, evolutionCreate: created }, 201);
});

app.get("/v1/numbers", async (c) => {
  const instance = c.get("instance");
  const numbers = await getActiveNumbers(c.env, instance.id);
  const withState = await Promise.all(
    numbers.map(async (n) => ({
      id: n.id,
      label: n.label,
      role: n.role,
      evolutionInstanceName: n.evolution_instance_name,
      connection: await evo.getConnectionState(n).catch(() => ({ ok: false, state: "unknown" })),
    }))
  );
  return c.json({ numbers: withState });
});

app.get("/v1/numbers/:id/qr", async (c) => {
  const instance = c.get("instance");
  const number = await c.env.DB.prepare("SELECT * FROM whatsapp_numbers WHERE id = ? AND instance_id = ?")
    .bind(c.req.param("id"), instance.id)
    .first<WhatsAppNumber>();
  if (!number) return c.json({ error: "number_not_found" }, 404);
  const result = await evo.connectAndGetQr(number);
  return c.json(result);
});

// Gera um link temporário (10 min) pra uma página de pareamento com QR ao vivo — assim quem vai
// escanear não depende de mim reenviando PNG estático toda vez que expira.
app.post("/v1/numbers/:id/qr-live-link", async (c) => {
  const instance = c.get("instance");
  const number = await c.env.DB.prepare("SELECT id FROM whatsapp_numbers WHERE id = ? AND instance_id = ?")
    .bind(c.req.param("id"), instance.id)
    .first<{ id: string }>();
  if (!number) return c.json({ error: "number_not_found" }, 404);

  const token = crypto.randomUUID().replace(/-/g, "");
  await c.env.HUB_STORAGE.put(`qrlive:${token}`, number.id, { expirationTtl: 600 });
  const url = new URL(c.req.url);
  return c.json({ url: `${url.origin}/qr-live/${token}`, expiresInSeconds: 600 });
});

app.get("/qr-live/:token/data", async (c) => {
  const numberId = await c.env.HUB_STORAGE.get(`qrlive:${c.req.param("token")}`);
  if (!numberId) return c.json({ error: "link_expired" }, 404);
  const number = await c.env.DB.prepare("SELECT * FROM whatsapp_numbers WHERE id = ?").bind(numberId).first<WhatsAppNumber>();
  if (!number) return c.json({ error: "number_not_found" }, 404);

  const state = await evo.getConnectionState(number);
  if (state.state === "open") return c.json({ state: state.state, qr: null });

  const qrResult = await evo.connectAndGetQr(number);
  return c.json({ state: state.state, qr: qrResult.qr });
});

app.get("/qr-live/:token", async (c) => {
  const numberId = await c.env.HUB_STORAGE.get(`qrlive:${c.req.param("token")}`);
  if (!numberId) return c.html("<p style='font-family:sans-serif'>Esse link expirou. Peça um novo.</p>", 404);

  return c.html(QR_LIVE_PAGE.replace("__TOKEN__", c.req.param("token")));
});

// ---------------------------------------------------------------------------
// Fontes (upload) — TTF/OTF validado por magic bytes, gravado no R2.
// ---------------------------------------------------------------------------
app.post("/v1/fonts", async (c) => {
  const instance = c.get("instance");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const familyName = String(form?.get("familyName") || "");
  if (!(file instanceof File) || !familyName) {
    return c.json({ error: "invalid_upload", details: "envie multipart/form-data com campos 'file' e 'familyName'" }, 400);
  }
  if (file.size > 2 * 1024 * 1024) return c.json({ error: "file_too_large", details: "limite de 2MB" }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isTtf = bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00;
  const isOtf = bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f; // "OTTO"
  if (!isTtf && !isOtf) return c.json({ error: "invalid_font_file", details: "esperado TTF ou OTF" }, 400);

  const id = newId("fnt");
  const r2Key = `fonts/${instance.id}/${id}.${isOtf ? "otf" : "ttf"}`;
  await c.env.HUB_ASSETS.put(r2Key, bytes, { httpMetadata: { contentType: isOtf ? "font/otf" : "font/ttf" } });
  await c.env.DB.prepare(
    "INSERT INTO fonts (id, instance_id, family_name, r2_key, original_filename, byte_size) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, instance.id, familyName, r2Key, file.name, bytes.byteLength)
    .run();

  return c.json({ id, familyName }, 201);
});

app.get("/v1/fonts", async (c) => {
  const instance = c.get("instance");
  const { results } = await c.env.DB.prepare("SELECT id, family_name, byte_size, created_at FROM fonts WHERE instance_id = ?")
    .bind(instance.id)
    .all();
  return c.json({ fonts: results || [] });
});

// ---------------------------------------------------------------------------
// Templates (texto ou card)
// ---------------------------------------------------------------------------
const cardFieldSchema = z.object({
  key: z.string(),
  x: z.number(),
  y: z.number(),
  size: z.number().positive(),
  color: z.string().optional(),
  align: z.enum(["start", "middle", "end"]).optional(),
  weight: z.number().optional(),
});

const cardConfigSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  backgroundColor: z.string(),
  accentColor: z.string().optional(),
  fontId: z.string().optional(),
  fontFamily: z.string().optional(),
  fields: z.array(cardFieldSchema).min(1),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["text", "card"]),
  textBody: z.string().optional(),
  cardConfig: cardConfigSchema.optional(),
}).refine((v) => (v.kind === "text" ? !!v.textBody : !!v.cardConfig), {
  message: "textBody é obrigatório para kind=text; cardConfig é obrigatório para kind=card",
});

app.post("/v1/templates", async (c) => {
  const instance = c.get("instance");
  const parsed = createTemplateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);

  const id = newId("tpl");
  await c.env.DB.prepare(
    `INSERT INTO templates (id, instance_id, name, kind, text_body, card_config)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (instance_id, name) DO UPDATE SET
       kind = excluded.kind, text_body = excluded.text_body, card_config = excluded.card_config, updated_at = datetime('now')`
  )
    .bind(id, instance.id, parsed.data.name, parsed.data.kind, parsed.data.textBody || null, parsed.data.cardConfig ? JSON.stringify(parsed.data.cardConfig) : null)
    .run();

  const saved = await c.env.DB.prepare("SELECT id FROM templates WHERE instance_id = ? AND name = ?").bind(instance.id, parsed.data.name).first<{ id: string }>();
  return c.json({ id: saved?.id || id }, 201);
});

app.get("/v1/templates", async (c) => {
  const instance = c.get("instance");
  const { results } = await c.env.DB.prepare("SELECT id, name, kind, updated_at FROM templates WHERE instance_id = ?").bind(instance.id).all();
  return c.json({ templates: results || [] });
});

// Renderiza um template sem enviar nada — útil pra conferir card/texto antes de disparar de verdade.
app.post("/v1/templates/:id/preview", async (c) => {
  const instance = c.get("instance");
  const template = await c.env.DB.prepare("SELECT * FROM templates WHERE id = ? AND instance_id = ?").bind(c.req.param("id"), instance.id).first<any>();
  if (!template) return c.json({ error: "template_not_found" }, 404);

  const data = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  if (template.kind === "text") {
    return c.json({ kind: "text", text: resolveMergeFields(template.text_body, data) });
  }
  const config = JSON.parse(template.card_config) as CardConfig;
  const png = await renderCard(c.env, instance.id, config, data);
  return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
});

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------
const sendMessageSchema = z.object({
  to: z.string().min(8),
  templateId: z.string().nullish(),
  text: z.string().nullish(),
  imageUrl: z.string().url().nullish(), // passthrough direto — sem template de card, sem re-renderizar
  data: z.record(z.any()).default({}),
  requireImage: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).max(30).default(5),
}).refine((v) => !!v.templateId || !!v.text, { message: "informe templateId ou text" });

app.post("/v1/messages", async (c) => {
  const instance = c.get("instance");
  const parsed = sendMessageSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);

  if (parsed.data.templateId) {
    const tpl = await c.env.DB.prepare("SELECT id FROM templates WHERE id = ? AND instance_id = ?").bind(parsed.data.templateId, instance.id).first();
    if (!tpl) return c.json({ error: "template_not_found" }, 404);
  }

  const id = await enqueueMessage(c.env, instance.id, parsed.data);
  return c.json({ id, status: "pending" }, 202);
});

app.get("/v1/messages/:id", async (c) => {
  const instance = c.get("instance");
  const message = await c.env.DB.prepare("SELECT * FROM messages WHERE id = ? AND instance_id = ?").bind(c.req.param("id"), instance.id).first<MessageRow>();
  if (!message) return c.json({ error: "not_found" }, 404);
  const { results: events } = await c.env.DB.prepare("SELECT event, detail, at FROM message_events WHERE message_id = ? ORDER BY id ASC").bind(message.id).all();
  return c.json({ ...message, events: events || [] });
});

app.get("/v1/messages", async (c) => {
  const instance = c.get("instance");
  const status = c.req.query("status");
  const limit = Math.min(200, Number(c.req.query("limit") || 50));
  const query = status
    ? c.env.DB.prepare("SELECT * FROM messages WHERE instance_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?").bind(instance.id, status, limit)
    : c.env.DB.prepare("SELECT * FROM messages WHERE instance_id = ? ORDER BY created_at DESC LIMIT ?").bind(instance.id, limit);
  const { results } = await query.all<MessageRow>();
  return c.json({ messages: results || [] });
});

// ---------------------------------------------------------------------------
// Envios recorrentes. O Hub nunca lê a tabela de domínio da instância — os
// destinatários vêm prontos (`static`) ou de um webhook que a própria instância
// expõe (`webhook`), resolvido a cada execução.
// ---------------------------------------------------------------------------
const scheduledJobSchema = z.object({
  templateId: z.string(),
  cronExpr: z.string().refine((v) => v.trim().split(/\s+/).length === 5, "cron precisa ter 5 campos: min hora dia-mes mes dia-semana"),
  recipientsMode: z.enum(["static", "webhook"]),
  recipientsStatic: z.array(z.object({ to: z.string(), data: z.record(z.any()).default({}) })).optional(),
  recipientsWebhookUrl: z.string().url().optional(),
}).refine((v) => (v.recipientsMode === "static" ? !!v.recipientsStatic?.length : !!v.recipientsWebhookUrl), {
  message: "recipientsStatic é obrigatório no modo static; recipientsWebhookUrl no modo webhook",
});

app.post("/v1/scheduled-jobs", async (c) => {
  const instance = c.get("instance");
  const parsed = scheduledJobSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);

  const template = await c.env.DB.prepare("SELECT id FROM templates WHERE id = ? AND instance_id = ?").bind(parsed.data.templateId, instance.id).first();
  if (!template) return c.json({ error: "template_not_found" }, 404);

  const id = newId("job");
  await c.env.DB.prepare(
    `INSERT INTO scheduled_jobs (id, instance_id, template_id, cron_expr, recipients_mode, recipients_static, recipients_webhook_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, instance.id, parsed.data.templateId, parsed.data.cronExpr, parsed.data.recipientsMode,
      parsed.data.recipientsStatic ? JSON.stringify(parsed.data.recipientsStatic) : null,
      parsed.data.recipientsWebhookUrl || null)
    .run();

  return c.json({ id }, 201);
});

app.get("/v1/scheduled-jobs", async (c) => {
  const instance = c.get("instance");
  const { results } = await c.env.DB.prepare(
    "SELECT id, template_id, cron_expr, recipients_mode, active, last_run_at, created_at FROM scheduled_jobs WHERE instance_id = ?"
  ).bind(instance.id).all();
  return c.json({ scheduledJobs: results || [] });
});

app.patch("/v1/scheduled-jobs/:id", async (c) => {
  const instance = c.get("instance");
  const body = (await c.req.json().catch(() => ({}))) as { active?: boolean };
  if (typeof body.active !== "boolean") return c.json({ error: "invalid_body", details: "envie {active: boolean}" }, 400);

  const result = await c.env.DB.prepare("UPDATE scheduled_jobs SET active = ? WHERE id = ? AND instance_id = ?")
    .bind(body.active ? 1 : 0, c.req.param("id"), instance.id)
    .run();
  if (!result.meta.changes) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

app.delete("/v1/scheduled-jobs/:id", async (c) => {
  const instance = c.get("instance");
  const result = await c.env.DB.prepare("DELETE FROM scheduled_jobs WHERE id = ? AND instance_id = ?").bind(c.req.param("id"), instance.id).run();
  if (!result.meta.changes) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

/** Roda a cada minuto (cron trigger). Acha os jobs ativos cujo cron bate com o minuto atual
 *  e ainda não rodaram nesse minuto, resolve os destinatários e enfileira uma mensagem por um. */
async function runDueScheduledJobs(env: Env, now: Date) {
  const nowIso = now.toISOString();
  const currentMinuteKey = nowIso.slice(0, 16); // YYYY-MM-DDTHH:MM
  const { results } = await env.DB.prepare("SELECT * FROM scheduled_jobs WHERE active = 1").all<any>();

  for (const job of results || []) {
    if (job.last_run_at && String(job.last_run_at).slice(0, 16) === currentMinuteKey) continue; // já rodou nesse minuto
    if (!cronMatches(job.cron_expr, now)) continue;

    let recipients: Array<{ to: string; data: Record<string, unknown> }> = [];
    try {
      if (job.recipients_mode === "static") {
        recipients = JSON.parse(job.recipients_static || "[]");
      } else {
        const res = await fetch(job.recipients_webhook_url, { headers: { Accept: "application/json" } });
        const body = await res.json().catch(() => ({}));
        recipients = Array.isArray((body as any)?.recipients) ? (body as any).recipients : [];
      }
    } catch (error) {
      console.error("[Scheduled Job] Failed to resolve recipients", { jobId: job.id, error: String(error) });
      recipients = [];
    }

    for (const recipient of recipients) {
      await enqueueMessage(env, job.instance_id, {
        to: recipient.to,
        templateId: job.template_id,
        data: recipient.data || {},
        requireImage: false,
        maxAttempts: 5,
      }).catch((error) => console.error("[Scheduled Job] Failed to enqueue", { jobId: job.id, to: recipient.to, error: String(error) }));
    }

    await env.DB.prepare("UPDATE scheduled_jobs SET last_run_at = ? WHERE id = ?").bind(nowIso, job.id).run();
  }
}

// ---------------------------------------------------------------------------
// Consumer da fila — aqui é onde a mensagem de fato sai pro WhatsApp.
// ---------------------------------------------------------------------------
async function handleOutboxMessage(env: Env, payload: QueueMessagePayload, retry: (opts?: { delaySeconds?: number }) => void, ack: () => void) {
  const row = await getMessage(env, payload.messageId);
  if (!row || row.status !== "pending") return ack(); // já tratada (idempotência em reentrega)

  const numbers = await getActiveNumbers(env, row.instance_id);
  const number = await evo.pickNumber(env, row.instance_id, numbers);
  if (!number) {
    await env.DB.prepare("UPDATE messages SET status = 'failed', last_error = ? WHERE id = ?").bind("no_active_number", row.id).run();
    await logEvent(env, row.id, "failed", { reason: "no_active_number" });
    return ack();
  }

  const throttle = await evo.checkThrottle(env, number);
  if (!throttle.ready) {
    await logEvent(env, row.id, "throttled", { waitSeconds: throttle.waitSeconds, numberId: number.id });
    return retry({ delaySeconds: throttle.waitSeconds });
  }

  const alive = await evo.keepAlive(number);
  if (alive.state !== "open") {
    await logEvent(env, row.id, "number_not_connected", { state: alive.state, numberId: number.id });
    return retry({ delaySeconds: 30 });
  }

  const body = JSON.parse(row.payload) as { data: Record<string, unknown>; text?: string; imageUrl?: string; requireImage?: boolean };

  let text = body.text || "";
  let imageDataUri: string | undefined = body.imageUrl || undefined;

  if (row.template_id) {
    const template = await env.DB.prepare("SELECT * FROM templates WHERE id = ?").bind(row.template_id).first<any>();
    if (template?.kind === "text") {
      text = resolveMergeFields(template.text_body, body.data);
    } else if (template?.kind === "card") {
      const config = JSON.parse(template.card_config) as CardConfig;
      const png = await renderCard(env, row.instance_id, config, body.data);
      imageDataUri = pngToDataUri(png);
      text = body.text || "";
    }
  }

  const result = await evo.sendWithFallback(number, row.to_phone, text, imageDataUri ? { dataUri: imageDataUri, requireImage: Boolean(row.require_image) } : null);
  await logEvent(env, row.id, result.success ? "sent" : "send_failed", result);

  if (result.success) {
    await env.DB.prepare("UPDATE messages SET status = 'sent', number_id = ?, sent_at = datetime('now') WHERE id = ?").bind(number.id, row.id).run();
    return ack();
  }

  const attempts = row.attempts + 1;
  await env.DB.prepare("UPDATE messages SET attempts = ?, last_error = ? WHERE id = ?").bind(attempts, result.error || "send_failed", row.id).run();
  if (attempts >= row.max_attempts) {
    await env.DB.prepare("UPDATE messages SET status = 'dead' WHERE id = ?").bind(row.id).run();
    await logEvent(env, row.id, "dead", { attempts });
    return ack(); // esgotado — não deixa a Queue reentregar, o registro já está marcado
  }
  return retry({ delaySeconds: Math.min(300, 15 * attempts) });
}

async function handleDeadLetter(env: Env, payload: QueueMessagePayload) {
  await env.DB.prepare("UPDATE messages SET status = 'dead' WHERE id = ? AND status != 'sent'").bind(payload.messageId).run();
  await logEvent(env, payload.messageId, "dead", { reason: "max_queue_retries_exhausted" });
}

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<QueueMessagePayload>, env: Env) {
    if (batch.queue.endsWith("-dlq")) {
      for (const message of batch.messages) {
        await handleDeadLetter(env, message.body);
        message.ack();
      }
      return;
    }
    for (const message of batch.messages) {
      await handleOutboxMessage(env, message.body, (opts) => message.retry(opts), () => message.ack());
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDueScheduledJobs(env, new Date()));
  },
};
