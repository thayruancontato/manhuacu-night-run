import { newId } from "./ids";

const KEY_BYTE_LENGTH = 32;

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gera uma nova API key em texto puro (mostrada uma única vez) + seu hash para guardar no D1. */
export async function generateApiKey(): Promise<{ plaintext: string; hash: string; prefix: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTE_LENGTH));
  const secret = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const plaintext = `whk_${secret}`;
  const hash = await sha256Hex(plaintext);
  const prefix = plaintext.slice(0, 11); // "whk_" + 7 chars, o suficiente para reconhecer a chave sem expor o resto
  return { plaintext, hash, prefix };
}

export async function hashApiKey(plaintext: string): Promise<string> {
  return sha256Hex(plaintext);
}

export { newId };
