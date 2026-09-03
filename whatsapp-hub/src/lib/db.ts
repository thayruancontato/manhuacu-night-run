import type { Env, MessageRow, WhatsAppNumber } from "../types";

export async function logEvent(env: Env, messageId: string, event: string, detail?: unknown) {
  await env.DB.prepare("INSERT INTO message_events (message_id, event, detail) VALUES (?, ?, ?)")
    .bind(messageId, event, detail === undefined ? null : JSON.stringify(detail))
    .run();
}

export async function getMessage(env: Env, id: string): Promise<MessageRow | null> {
  return env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first<MessageRow>();
}

export async function getActiveNumbers(env: Env, instanceId: string): Promise<WhatsAppNumber[]> {
  const { results } = await env.DB.prepare("SELECT * FROM whatsapp_numbers WHERE instance_id = ? AND active = 1").bind(instanceId).all<WhatsAppNumber>();
  return results || [];
}
