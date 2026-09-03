import { Resvg, initWasm } from "@resvg/resvg-wasm";
// @ts-ignore — módulo wasm, resolvido pela regra `Data` do wrangler.toml
import RESVG_WASM_MODULE from "@resvg/resvg-wasm/index_bg.wasm";
// @ts-ignore
import DEFAULT_FONT_TTF from "../assets/default-font.ttf";
import { xmlEscape, resolveMergeFields } from "./merge";
import type { Env } from "../types";

let resvgReady: Promise<void> | null = null;
async function ensureResvg() {
  if (!resvgReady) {
    resvgReady = initWasm(RESVG_WASM_MODULE as any).catch((error: any) => {
      if (!String(error?.message || "").includes("Already initialized")) throw error;
    });
  }
  return resvgReady;
}

export type CardField = {
  key: string;
  x: number;
  y: number;
  size: number;
  color?: string;
  align?: "start" | "middle" | "end";
  weight?: number;
};

export type CardConfig = {
  width: number;
  height: number;
  backgroundColor: string;
  accentColor?: string;
  fontId?: string;
  fontFamily?: string;
  fields: CardField[];
};

/** Monta o SVG do card a partir do template configurável da instância + os dados livres enviados
 *  na mensagem. Todo valor textual passa por escape de entidades antes de entrar no markup. */
function buildSvg(config: CardConfig, data: Record<string, unknown>): string {
  const { width: W, height: H } = config;
  const fontFamily = config.fontFamily || "HubFont";

  const border = config.accentColor
    ? `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="24" fill="none" stroke="${xmlEscape(
        config.accentColor
      )}" stroke-opacity="0.55" stroke-width="4"/>`
    : "";

  const texts = config.fields
    .map((field) => {
      const raw = (data as Record<string, unknown>)[field.key];
      const value = xmlEscape(raw === undefined ? "" : raw);
      const color = xmlEscape(field.color || config.accentColor || "#ffffff");
      const anchor = field.align || "start";
      const weight = field.weight || 700;
      return `<text x="${field.x}" y="${field.y}" font-size="${field.size}" fill="${color}" text-anchor="${anchor}" font-family="${fontFamily}" font-weight="${weight}">${value}</text>`;
    })
    .join("\n    ");

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" rx="20" fill="${xmlEscape(config.backgroundColor)}"/>
    ${border}
    ${texts}
  </svg>`;
}

async function loadFontBytes(env: Env, fontId?: string): Promise<Uint8Array> {
  if (!fontId) return new Uint8Array(DEFAULT_FONT_TTF as ArrayBuffer);
  const row = await env.DB.prepare("SELECT r2_key FROM fonts WHERE id = ?").bind(fontId).first<{ r2_key: string }>();
  if (!row) return new Uint8Array(DEFAULT_FONT_TTF as ArrayBuffer);
  const object = await env.HUB_ASSETS.get(row.r2_key);
  if (!object) return new Uint8Array(DEFAULT_FONT_TTF as ArrayBuffer);
  return new Uint8Array(await object.arrayBuffer());
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Renderiza (ou reaproveita do cache em R2) o PNG de um card. Cacheado por hash de
 *  template + dados — mensagens repetidas com o mesmo conteúdo (ex.: banner de data do dia)
 *  não pagam o custo de renderizar de novo. */
export async function renderCard(env: Env, instanceId: string, config: CardConfig, data: Record<string, unknown>): Promise<Uint8Array> {
  const cacheKey = `card-cache/${instanceId}/${await sha256Hex(JSON.stringify({ config, data }))}.png`;
  const cached = await env.HUB_ASSETS.get(cacheKey);
  if (cached) return new Uint8Array(await cached.arrayBuffer());

  await ensureResvg();
  const fontBytes = await loadFontBytes(env, config.fontId);
  const svg = buildSvg(config, data);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: config.width },
    font: { fontBuffers: [fontBytes], loadSystemFonts: false, defaultFontFamily: config.fontFamily || "HubFont" },
  });
  const png = resvg.render().asPng();

  await env.HUB_ASSETS.put(cacheKey, png, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { instanceId },
  });
  return png;
}

export function pngToDataUri(png: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < png.byteLength; i++) bin += String.fromCharCode(png[i]);
  return `data:image/png;base64,${btoa(bin)}`;
}

export { resolveMergeFields };
