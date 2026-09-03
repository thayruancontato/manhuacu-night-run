// Cliente para a Evolution API (gateway de WhatsApp / Baileys), agora parametrizado por número
// em vez de env vars globais — cada `WhatsAppNumber` traz sua própria base URL + api key.
import type { Env, WhatsAppNumber } from "../types";

export function formatPhoneForWhatsApp(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function evoFetch(number: WhatsAppNumber, path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(`${number.evolution_base_url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...(init.headers || {}), apikey: number.evolution_api_key },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getConnectionState(number: WhatsAppNumber): Promise<{ ok: boolean; state: string }> {
  try {
    const res = await evoFetch(number, `/instance/connectionState/${number.evolution_instance_name}`);
    const data: any = await res.json().catch(() => ({}));
    const state = data?.instance?.state || data?.state || (res.ok ? "unknown" : "error");
    return { ok: res.ok, state };
  } catch (error: any) {
    return { ok: false, state: "error" };
  }
}

export async function keepAlive(number: WhatsAppNumber): Promise<{ ok: boolean; state: string }> {
  const current = await getConnectionState(number);
  if (current.state === "open" || current.state === "connecting") return current;
  const res = await evoFetch(number, `/instance/connect/${number.evolution_instance_name}`);
  return { ok: res.ok, state: current.state };
}

export async function createInstance(number: WhatsAppNumber) {
  const res = await evoFetch(number, "/instance/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instanceName: number.evolution_instance_name,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

export async function connectAndGetQr(number: WhatsAppNumber) {
  const res = await evoFetch(number, `/instance/connect/${number.evolution_instance_name}`);
  const body: any = await res.json().catch(() => ({}));
  return { ok: res.ok, qr: body?.base64 || body?.qrcode?.base64 || null, raw: body };
}

export type SendResult = {
  success: boolean;
  httpStatus?: number;
  error?: string;
  raw?: unknown;
};

async function evoSend(number: WhatsAppNumber, phone: string, text: string, imageBase64OrUrl?: string, mime = "image/png"): Promise<SendResult> {
  const normalizedPhone = formatPhoneForWhatsApp(phone);
  const isMedia = Boolean(imageBase64OrUrl);
  const endpoint = isMedia
    ? `/message/sendMedia/${number.evolution_instance_name}`
    : `/message/sendText/${number.evolution_instance_name}`;

  const payload: Record<string, unknown> = { number: normalizedPhone };
  if (isMedia) {
    let media = imageBase64OrUrl!;
    let mimetype = mime;
    if (media.startsWith("data:")) {
      const match = media.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimetype = match[1];
        media = match[2];
      }
    }
    payload.mediatype = "image";
    payload.mediaType = "image";
    payload.mimetype = mimetype;
    payload.fileName = "imagem.png";
    payload.caption = text;
    payload.media = media;
  } else {
    payload.text = text;
    payload.linkPreview = false;
  }

  const res = await evoFetch(number, endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const raw = await res.json().catch(() => ({}));
  const error = (raw as any)?.response?.message || (raw as any)?.message || (raw as any)?.error;
  return { success: res.ok, httpStatus: res.status, error, raw };
}

/** Envia com fallback: se tiver imagem e a Evolution recusar, tenta re-hospedar como base64;
 *  se ainda assim falhar e a imagem não for obrigatória, cai para texto puro. */
export async function sendWithFallback(
  number: WhatsAppNumber,
  phone: string,
  text: string,
  image: { dataUri?: string; requireImage: boolean } | null
): Promise<SendResult & { fallback?: string }> {
  if (!image?.dataUri) return evoSend(number, phone, text);

  const first = await evoSend(number, phone, text, image.dataUri);
  if (first.success) return first;
  if (image.requireImage) return { ...first, fallback: "image_required_failed" };

  const textOnly = await evoSend(number, phone, text);
  return { ...textOnly, fallback: "text_only" };
}

// ---- Throttle e round-robin por instância, no KV (mesmo padrão do worker original) ----

const THROTTLE_PREFIX = "throttle:last-send:";
const RR_PREFIX = "rr:index:";

/** Checa o intervalo mínimo entre envios de um número, sem dormir a execução: se ainda não
 *  passou o suficiente, devolve quantos segundos faltam para o chamador reagendar a mensagem
 *  na fila (`message.retry({ delaySeconds })`) em vez de segurar o worker acordado esperando. */
export async function checkThrottle(env: Env, number: WhatsAppNumber): Promise<{ ready: boolean; waitSeconds: number }> {
  const delayMs = Number(env.WHATSAPP_INSTANCE_DELAY_MS || 30000);
  const key = `${THROTTLE_PREFIX}${number.id}`;
  const last = Number((await env.HUB_STORAGE.get(key)) || 0);
  const waitMs = Math.max(0, last + delayMs - Date.now());
  if (waitMs > 0) return { ready: false, waitSeconds: Math.ceil(waitMs / 1000) };
  await env.HUB_STORAGE.put(key, String(Date.now()), { expirationTtl: 3600 });
  return { ready: true, waitSeconds: 0 };
}

/** Escolhe um número ativo da instância, girando entre os conectados (round-robin por tenant). */
export async function pickNumber(env: Env, instanceId: string, numbers: WhatsAppNumber[]): Promise<WhatsAppNumber | null> {
  const sendable = numbers.filter((n) => n.active && (n.role === "send" || n.role === "both"));
  if (!sendable.length) return null;
  if (sendable.length === 1) return sendable[0];

  const key = `${RR_PREFIX}${instanceId}`;
  const current = Number((await env.HUB_STORAGE.get(key)) || 0);
  await env.HUB_STORAGE.put(key, String(current + 1));
  return sendable[current % sendable.length];
}
