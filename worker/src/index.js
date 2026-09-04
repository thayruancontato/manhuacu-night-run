/**
 * Cloudflare Worker: MCU Night Run API
 * Proxy para Asaas, Evolution API, R2 Storage e Fila de Mensagens
 */

import { Resvg, initWasm } from "@resvg/resvg-wasm";
import RESVG_WASM_MODULE from "@resvg/resvg-wasm/index_bg.wasm";
import MONTSERRAT_TTF from "./assets/montserrat-800.ttf";
import { PDFDocument } from "pdf-lib";

let resvgWasmReady = null;
async function ensureResvgWasm() {
  if (!resvgWasmReady) {
    resvgWasmReady = initWasm(RESVG_WASM_MODULE).catch(error => {
      // "Already initialized" acontece quando o isolate ja rodou initWasm antes (reuso de worker).
      if (!String(error?.message || "").includes("Already initialized")) throw error;
    });
  }
  return resvgWasmReady;
}

const OPERATIONAL_LOGO_URL = "https://night-run-uba.web.app/LOGO%20NIGHT%20RUN%20SEM%20FUNDO%20%28em%20amarelo%29.png";

// Busca o logo em base64, cacheado no KV (o arquivo nao muda com frequencia).
async function getOperationalLogoBase64(env) {
  const cacheKey = "opsummary:logo:base64:v1";
  if (env.NIGHTRUN_STORAGE) {
    const cached = await env.NIGHTRUN_STORAGE.get(cacheKey);
    if (cached) return cached;
  }
  const res = await fetch(OPERATIONAL_LOGO_URL);
  if (!res.ok) throw new Error("Falha ao baixar o logo para o banner.");
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  const base64 = btoa(bin);
  if (env.NIGHTRUN_STORAGE) {
    await env.NIGHTRUN_STORAGE.put(cacheKey, base64, { expirationTtl: 30 * 86400 });
  }
  return base64;
}

const xmlEscape = (value) => String(value ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Gera o banner (logo + titulo + data DD/MM real) como PNG, renderizado no proprio worker.
async function generateOperationalBannerPng(env, shortDateLabel) {
  await ensureResvgWasm();
  const logoBase64 = await getOperationalLogoBase64(env);
  const W = 700, H = 900;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#071A45"/>
        <stop offset="100%" stop-color="#0b2560"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="28" fill="url(#bg)"/>
    <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="24" fill="none" stroke="#6BFF2A" stroke-opacity="0.45" stroke-width="4"/>
    <image x="${W / 2 - 150}" y="70" width="300" height="300" href="data:image/png;base64,${logoBase64}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${W / 2}" y="430" font-size="26" fill="#6BFF2A" text-anchor="middle" font-family="Montserrat" font-weight="800" letter-spacing="2">MCU NIGHT RUN 2026</text>
    <text x="${W / 2}" y="500" font-size="46" fill="#ffffff" text-anchor="middle" font-family="Montserrat" font-weight="800">RESUMO OPERACIONAL</text>
    <line x1="90" y1="560" x2="${W - 90}" y2="560" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2"/>
    <text x="${W / 2}" y="590" font-size="20" fill="#94a3b8" text-anchor="middle" font-family="Montserrat" font-weight="800" letter-spacing="3">REFERENTE A</text>
    <text x="${W / 2}" y="760" font-size="150" fill="#6BFF2A" text-anchor="middle" font-family="Montserrat" font-weight="800">${xmlEscape(shortDateLabel)}</text>
  </svg>`;
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: { fontBuffers: [new Uint8Array(MONTSERRAT_TTF)], loadSystemFonts: false, defaultFontFamily: "Montserrat" },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  rendered.free();
  resvg.free();
  return png;
}

function pngToDataUri(pngBytes) {
  let bin = "";
  for (let i = 0; i < pngBytes.byteLength; i++) bin += String.fromCharCode(pngBytes[i]);
  return `data:image/png;base64,${btoa(bin)}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization, asaas-access-token, asaas-signature, x-cora-token, cora-signature",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
      // ==================== ASAAS PROXY ====================
      if (path.startsWith("/asaas/")) {
        const asaasPath = path.replace("/asaas", "");
        
        if (path === "/asaas/customers" && request.method === "POST") {
          const body = await request.json();
          const r = await fetch(`${env.ASAAS_BASE_URL}/customers`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0" },
            body: JSON.stringify(body)
          });
          return json(await r.json(), r.status);
        }

        if (path === "/asaas/payments" && request.method === "POST") {
          const body = await request.json();
          const r = await fetch(`${env.ASAAS_BASE_URL}/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0" },
            body: JSON.stringify(body)
          });
          return json(await r.json(), r.status);
        }

        if (path === "/asaas/balance" && request.method === "GET") {
          const r = await fetch(`${env.ASAAS_BASE_URL}/finance/balance`, {
            headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0" }
          });
          return json(await r.json(), r.status);
        }

        if (path.startsWith("/asaas/payments/") && request.method === "GET") {
          const id = path.split("/asaas/payments/")[1];
          const r = await fetch(`${env.ASAAS_BASE_URL}/payments/${id}`, {
            headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0" }
          });
          return json(await r.json(), r.status);
        }

        if (path.startsWith("/asaas/payments/") && path.endsWith("/simulate") && request.method === "POST") {
          return json({ error: "Endpoint indisponivel em producao." }, 404);
        }

        // Webhook Asaas
        if (path === "/asaas/webhook" && request.method === "POST") {
          const accessToken = request.headers.get("asaas-access-token");
          const legacySignature = request.headers.get("asaas-signature");
          const webhookToken = accessToken || legacySignature;
          if (env.ASAAS_WEBHOOK_SECRET && webhookToken !== env.ASAAS_WEBHOOK_SECRET) {
            return json({ error: "Invalid signature" }, 401);
          }
          const body = await request.json();
          const paymentId = body.payment?.id;
          const status = body.event; // PAYMENT_RECEIVED, PAYMENT_CONFIRMED, etc
          if (paymentId && (status === "PAYMENT_RECEIVED" || status === "PAYMENT_CONFIRMED")) {
            const paymentSearch = await findRegistrationByPaymentId(env, paymentId, ["asaasPaymentId", "creditCardAsaasPaymentId", "paymentExternalId"]);
            if (paymentSearch.document) {
              const docPath = paymentSearch.document.name;
              const fields = paymentSearch.document.fields || {};
              const alreadyPaid = fields.paymentStatus?.stringValue === "pago";
              if (!alreadyPaid) {
                ctx?.waitUntil(confirmRegistrationPayment(env, paymentId, ctx, {
                  searchFields: ["asaasPaymentId", "creditCardAsaasPaymentId", "paymentExternalId"]
                }));
              } else if (paymentSearch.matchedField === "creditCardAsaasPaymentId") {
                ctx?.waitUntil(markRegistrationAsAsaasCreditCard(env, paymentSearch.document));
              }

              // Lógica do Sorteio Surpresa (Worker)
              try {
                const configUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`;
                const configBody = {
                  structuredQuery: {
                    from: [{ collectionId: "nightrun_sorteios_config" }],
                    limit: 1
                  }
                };
                const configRes = await fetch(configUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(configBody) });
                const configResults = await configRes.json();
                
                if (configResults[0]?.document) {
                  const confFields = configResults[0].document.fields || {};
                  const isAtivo = confFields.ativo?.booleanValue === true;
                  const isGarantido = confFields.ganhoGarantido?.booleanValue === true;
                  
                  if (isAtivo || isGarantido) {
                    const tipoRegra = confFields.tipoRegra?.stringValue || "frequencia";
                    const freq = Number(confFields.frequencia?.integerValue || confFields.frequencia?.doubleValue || 0);
                    const numerosEspecificos = confFields.numerosEspecificos?.arrayValue?.values?.map(v => Number(v.integerValue || v.doubleValue)) || [];
                    const instrucoes = confFields.instrucoes?.stringValue || "";
                    
                    if (tipoRegra === "especifico" || freq > 0 || isGarantido) {
                      const countBody = {
                        structuredQuery: {
                          from: [{ collectionId: "nightrun_registrations" }],
                          where: { fieldFilter: { field: { fieldPath: "paymentStatus" }, op: "EQUAL", value: { stringValue: "pago" } } }
                        }
                      };
                      const countRes = await fetch(configUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(countBody) });
                      const countResults = await countRes.json();
                      const totalPagos = (countResults[0]?.document ? countResults.length : 0);

                      let ganhou = false;
                      if (isGarantido) {
                        ganhou = true;
                      } else if (tipoRegra === "especifico") {
                        ganhou = numerosEspecificos.includes(totalPagos);
                      } else {
                        ganhou = freq > 0 && totalPagos % freq === 0;
                      }

                      if (totalPagos > 0 && ganhou) {
                        const premios = confFields.premios?.arrayValue?.values || [];
                        let premioSelecionado = null;
                        let updatedPremios = [];

                        for (let i = 0; i < premios.length; i++) {
                          const pFields = premios[i].mapValue.fields;
                          const pNome = pFields.nome?.stringValue;
                          const pId = pFields.id?.stringValue;
                          const pImagem = pFields.imagem?.stringValue || '';
                          const pQtd = Number(pFields.quantidade?.integerValue || pFields.quantidade?.doubleValue || 0);
                          const pDist = Number(pFields.distribuidos?.integerValue || pFields.distribuidos?.doubleValue || 0);

                          if (!premioSelecionado && pQtd > pDist) {
                            premioSelecionado = { id: pId, nome: pNome, imagem: pImagem };
                            updatedPremios.push({
                              mapValue: {
                                fields: {
                                  ...pFields,
                                  distribuidos: { integerValue: pDist + 1 }
                                }
                              }
                            });
                          } else {
                            updatedPremios.push(premios[i]);
                          }
                        }

                        if (premioSelecionado) {
                          // Atualiza Inscricao
                          await fetch(`https://firestore.googleapis.com/v1/${docPath}?key=${env.FIREBASE_API_KEY}&updateMask.fieldPaths=premioSorteio&updateMask.fieldPaths=premioImagem`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ 
                              fields: { 
                                premioSorteio: { stringValue: premioSelecionado.nome },
                                premioImagem: { stringValue: premioSelecionado.imagem }
                              } 
                            })
                          });
                          
                          // Atualiza Prêmios no Config
                          await fetch(`https://firestore.googleapis.com/v1/${configResults[0].document.name}?key=${env.FIREBASE_API_KEY}&updateMask.fieldPaths=premios`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ fields: { premios: { arrayValue: { values: updatedPremios } } } })
                          });

                          const regId = docPath.split('/').pop();
                          const ganhadorBody = {
                            fields: {
                              registrationId: { stringValue: regId },
                              alunoNome: { stringValue: fields.nome?.stringValue || "" },
                              telefone: { stringValue: fields.telefone?.stringValue || "" },
                              premioNome: { stringValue: premioSelecionado.nome },
                              premioImagem: { stringValue: premioSelecionado.imagem },
                              dataHora: { stringValue: new Date().toISOString() }
                            }
                          };
                          await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_sorteios_ganhadores?key=${env.FIREBASE_API_KEY}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(ganhadorBody)
                          });

                          if (phone) {
                            await queueMessage({ 
                              phone: phone.startsWith("55") ? phone : "55" + phone, 
                              text: `🎉 *PARABÉNS! VOCÊ GANHOU O SORTEIO SURPRESA!* 🎉\n\nOlá ${nome}, você foi o inscrito de número ${totalPagos} e ganhou: *${premioSelecionado.nome}*!\n\n${instrucoes}` 
                            }, env);
                            ctx?.waitUntil(processQueue(env));
                          }
                        }
                      }
                    }
                  }
                }
              } catch (eSorteio) {
                console.error("Erro no sorteio do worker:", eSorteio);
              }
            }
          }
          return json({ received: true });
        }
      }

      // ==================== CORA PROXY ====================
      if (path.startsWith("/cora/")) {
        if (path === "/cora/invoices/pix" && request.method === "POST") {
          const body = await request.json();
          const result = await createCoraPixInvoice(env, body);
          return json(result.body, result.status);
        }

        if (path === "/cora/webhook" && request.method === "POST") {
          const bodyText = await request.text();
          let body = {};
          try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }
          const token = url.searchParams.get("token") ||
            request.headers.get("x-cora-token") ||
            request.headers.get("cora-signature") ||
            body?.token ||
            body?.webhook_token ||
            (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
          const eventType = extractCoraWebhookEventType(body, request.headers);
          const resourceId = extractCoraInvoiceId(body, request.headers);
          const isCoraWebhook = (request.headers.get("user-agent") || "").toLowerCase().includes("cora-webhook") ||
            String(eventType || "").toLowerCase().startsWith("invoice.") ||
            String(eventType || "").toLowerCase().startsWith("payment.");
          if (env.CORA_WEBHOOK_SECRET && token !== env.CORA_WEBHOOK_SECRET && !isCoraWebhook) {
            return json({ error: "Invalid signature" }, 401);
          }

          const invoiceId = extractCoraInvoiceId(body, request.headers);
          const bodyStatus = extractCoraPaymentStatus(body, request.headers);
          console.log("[Cora Webhook] Received", { eventType, resourceId, invoiceId, bodyStatus, hasBody: Boolean(bodyText) });

          // Nao confia so no status embutido no corpo do webhook pra decidir "pago" - o formato
          // exato que a Cora manda pode variar/mudar e um campo nao reconhecido faria o
          // pagamento ficar preso pendente pra sempre, silenciosamente. Em vez disso, qualquer
          // evento relacionado a fatura reconsulta o status real direto na API da Cora (fonte
          // da verdade) antes de decidir confirmar ou nao.
          let status = bodyStatus;
          if (invoiceId && bodyStatus !== "paid") {
            const liveCheck = await checkCoraInvoiceStatus(env, invoiceId).catch(error => {
              console.error("[Cora Webhook] Live status check failed", { invoiceId, error: error.message });
              return null;
            });
            if (liveCheck?.paid) status = "paid";
          }

          if (invoiceId && status === "paid") {
            const result = await confirmRegistrationPayment(env, invoiceId, ctx, {
              searchFields: ["coraInvoiceId", "coraInvoiceCode", "paymentExternalId"]
            });
            console.log("[Cora Webhook] Confirmation result", { invoiceId, result });
          }
          return json({ received: true, invoiceId, status, bodyStatus });
        }
      }

      // ==================== WEBHOOK DIAGNOSTICS ====================
      if (path === "/webhooks/test" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const provider = body.provider === "cora" ? "cora" : "asaas";
        const result = await testWebhookIntegration(env, provider, url.origin);
        return json(result, result.success ? 200 : 422);
      }

      if (path === "/payments/audit-pending" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const limit = Math.min(Math.max(Number(body.limit || 150), 1), 300);
        const result = await auditPendingPayments(env, { limit });
        return json(result, 200);
      }

      if (path === "/payments/confirm-paid" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const registrationIds = Array.isArray(body.registrationIds) ? body.registrationIds.map(String).filter(Boolean) : [];
        if (!registrationIds.length) return json({ success: false, error: "Nenhuma inscricao informada." }, 400);
        const results = [];
        for (const registrationId of registrationIds.slice(0, 300)) {
          const result = await confirmRegistrationPaymentById(env, registrationId, ctx, { forceNotify: true, markGhost: true });
          results.push({ registrationId, ...result });
        }
        return json({ success: true, count: results.length, results });
      }

      // Status da ultima rodada da reconciliacao automatica (roda sozinha a cada 5 min via
      // cron) - o painel usa isso pra mostrar quando rodou pela ultima vez e o que corrigiu.
      if (path === "/payments/auto-reconcile-status" && request.method === "GET") {
        const raw = env.NIGHTRUN_STORAGE ? await env.NIGHTRUN_STORAGE.get("payments:auto-reconcile:last-run") : null;
        return json({ success: true, lastRun: raw ? JSON.parse(raw) : null }, 200);
      }

      // Dispara a reconciliacao automatica na hora (o painel usa isso no botao "verificar
      // agora", sem precisar esperar o proximo tick do cron).
      if (path === "/payments/auto-reconcile-run" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const windowHours = Math.min(Math.max(Number(body.windowHours || 6), 1), 72);
        const result = await autoReconcilePendingPayments(env, ctx, { windowHours });
        return json({ success: result.ok !== false, ...result }, 200);
      }

      // Corrige inscricoes pagas no cartao (Asaas) cujos campos de provedor/metodo ficaram
      // desatualizados (ex: cliente comecou no Pix e trocou pra cartao) - sem isso, futuras
      // verificacoes/relatorios continuam olhando pro ID de pagamento errado.
      if (path === "/payments/fix-credit-card-links" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const result = await fixCreditCardProviderRecords(env, { dryRun: body.dryRun !== false, limit: body.limit });
        return json(result, 200);
      }

      if (path === "/bank-balances" && request.method === "GET") {
        const [asaas, cora] = await Promise.allSettled([
          getAsaasBalance(env),
          getCoraBalance(env)
        ]);
        const result = {
          asaas: asaas.status === "fulfilled" ? asaas.value : { ok: false, error: asaas.reason?.message || "Falha ao consultar saldo Asaas." },
          cora: cora.status === "fulfilled" ? cora.value : { ok: false, error: cora.reason?.message || "Falha ao consultar saldo Cora." },
          checkedAt: new Date().toISOString()
        };
        return json(result, 200);
      }

      if (path === "/bank-movements" && request.method === "GET") {
        const today = new Date();
        const defaultStart = new Date(today);
        defaultStart.setDate(defaultStart.getDate() - 90);
        const start = url.searchParams.get("start") || formatDateOnly(defaultStart);
        const end = url.searchParams.get("end") || formatDateOnly(today);
        const [asaas, cora] = await Promise.allSettled([
          getAsaasMovements(env, { start, end }),
          getCoraMovements(env, { start, end })
        ]);
        const result = {
          asaas: asaas.status === "fulfilled" ? asaas.value : { ok: false, error: asaas.reason?.message || "Falha ao consultar extrato Asaas.", items: [] },
          cora: cora.status === "fulfilled" ? cora.value : { ok: false, error: cora.reason?.message || "Falha ao consultar extrato Cora.", items: [] },
          start,
          end,
          checkedAt: new Date().toISOString()
        };
        return json(result, 200);
      }

      if (path === "/bank-invoices" && request.method === "GET") {
        const provider = url.searchParams.get("provider");
        if (provider !== "asaas" && provider !== "cora") {
          return json({ ok: false, error: "Banco invalido. Informe asaas ou cora." }, 400);
        }
        const result = provider === "asaas"
          ? await getAsaasInvoices(env)
          : await getCoraInvoices(env);
        return json(result, result.ok ? 200 : (result.status || 502));
      }

      if (path === "/bank-invoices/asaas/reconcile-paid" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const result = await reconcilePaidAsaasInvoices(env, { apply: body.apply === true });
        return json(result, result.ok ? 200 : (result.status || 502));
      }

      if (path === "/bank-invoices/asaas/reconcile-system-pending" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const result = await reconcileAsaasPaidSystemPending(env, {
          confirm: body.confirm === true,
          registrationIds: Array.isArray(body.registrationIds) ? body.registrationIds.map(String).filter(Boolean) : []
        }, ctx);
        return json(result, result.ok ? 200 : (result.status || 502));
      }

      if (path === "/bank-invoices/asaas/delete-bulk" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
        if (!ids.length) return json({ ok: false, error: "Nenhuma fatura informada." }, 400);
        const result = await deleteAsaasInvoicesBulk(env, ids);
        return json(result, result.ok ? 200 : 502);
      }

      if (path === "/bank-invoices/asaas/cleanup-registrations" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const result = await cleanupPendingAsaasRegistrations(env, {
          apply: body.apply === true,
          registrationIds: Array.isArray(body.registrationIds) ? body.registrationIds.map(String).filter(Boolean) : []
        });
        return json(result, result.ok ? 200 : (result.status || 502));
      }

      const bankInvoiceMatch = path.match(/^\/bank-invoices\/(asaas|cora)\/([^/]+)$/);
      if (bankInvoiceMatch && request.method === "DELETE") {
        const provider = bankInvoiceMatch[1];
        const invoiceId = decodeURIComponent(bankInvoiceMatch[2]);
        const result = provider === "asaas"
          ? await deleteAsaasInvoice(env, invoiceId)
          : await deleteCoraInvoice(env, invoiceId);
        return json(result, result.ok ? 200 : (result.status || 502));
      }

      const manualConfirmMatch = path.match(/^\/registrations\/([^/]+)\/confirm-payment$/);
      if (manualConfirmMatch && request.method === "POST") {
        const registrationId = decodeURIComponent(manualConfirmMatch[1]);
        const result = await confirmRegistrationPaymentById(env, registrationId, ctx, { forceNotify: true });
        if (!result.found) return json(result, 404);
        return json(result, 200);
      }

      const sendCardMatch = path.match(/^\/registrations\/([^/]+)\/send-payment-card$/);
      if (sendCardMatch && request.method === "POST") {
        const registrationId = decodeURIComponent(sendCardMatch[1]);
        const result = await sendRegistrationPaymentCardById(env, registrationId, ctx, { force: true });
        if (!result.found) return json(result, 404);
        return json(result, result.success ? 200 : 422);
      }

      const checkPaymentMatch = path.match(/^\/registrations\/([^/]+)\/check-payment$/);
      if (checkPaymentMatch && request.method === "POST") {
        const registrationId = decodeURIComponent(checkPaymentMatch[1]);
        
        // 1. Buscar a inscricao no firestore
        const docUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_registrations/${encodeURIComponent(registrationId)}?key=${env.FIREBASE_API_KEY}`;
        const docRes = await fetch(docUrl);
        if (docRes.status === 404) return json({ found: false, error: "Inscrição não encontrada." }, 404);
        if (!docRes.ok) {
          const errorText = await docRes.text().catch(() => "");
          return json({ found: false, error: "Erro ao buscar inscrição no Firestore.", details: errorText }, docRes.status);
        }
        
        const document = await docRes.json();
        const fields = document.fields || {};
        const alreadyPaid = fields.paymentStatus?.stringValue === "pago";
        
        if (alreadyPaid) {
          const confirmResult = await confirmRegistrationDocument(env, document, ctx, { manual: false });
          return json({ paid: true, alreadyPaid: true, status: "paid", confirmResult });
        }
        
        const registrationPaymentChecks = buildRegistrationPaymentChecks({
          paymentProvider: firestoreString(fields.paymentProvider),
          paymentMethod: firestoreString(fields.paymentMethod),
          asaasPaymentId: firestoreString(fields.asaasPaymentId),
          creditCardAsaasPaymentId: firestoreString(fields.creditCardAsaasPaymentId),
          coraInvoiceId: firestoreString(fields.coraInvoiceId),
          coraInvoiceCode: firestoreString(fields.coraInvoiceCode),
          paymentExternalId: firestoreString(fields.paymentExternalId)
        });

        if (!registrationPaymentChecks.length) {
          return json({ paid: false, status: "pending", error: "Código de pagamento não encontrado na inscrição." }, 200);
        }

        const checkedPayments = [];
        for (const paymentCheck of registrationPaymentChecks) {
          const bankCheck = await checkBankPaymentStatus(env, paymentCheck.provider, paymentCheck.paymentId);
          checkedPayments.push({ ...paymentCheck, ...bankCheck, bankStatus: bankCheck.status });
          if (bankCheck.paid) {
            const confirmResult = await confirmRegistrationDocument(env, document, ctx, {
              manual: false,
              matchedPaymentField: paymentCheck.matchedPaymentField
            });
            return json({
              paid: true,
              confirmed: true,
              status: "paid",
              bankCheck,
              checkedPayments,
              confirmResult,
              method: paymentCheck.paymentMethod,
              provider: paymentCheck.provider
            });
          }
        }

        return json({ paid: false, status: checkedPayments[0]?.status || "pending", checkedPayments, bankCheck: checkedPayments[0] });
      }

      const cardPaymentMatch = path.match(/^\/registrations\/([^/]+)\/credit-card-payment$/);
      if (cardPaymentMatch && request.method === "POST") {
        const registrationId = decodeURIComponent(cardPaymentMatch[1]);
        const result = await createCreditCardPaymentForRegistration(env, registrationId);
        return json(result, result.success ? 200 : 400);
      }

      // ==================== MEDIA (R2) ====================
      if (path === "/media/upload" && request.method === "POST") {
        const contentType = request.headers.get("Content-Type") || "";
        let fileData, fileName, mimeType;

        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const file = formData.get("file");
          if (!file) return json({ error: "No file" }, 400);
          fileData = await file.arrayBuffer();
          fileName = file.name || crypto.randomUUID();
          mimeType = file.type || "application/octet-stream";
          const folder = String(formData.get("folder") || "uploads").replace(/[^a-zA-Z0-9_-]/g, "_");
          url.searchParams.set("folder", folder);
        } else {
          fileData = await request.arrayBuffer();
          fileName = url.searchParams.get("name") || crypto.randomUUID();
          mimeType = contentType.split(";")[0] || "image/jpeg";
        }

        if (fileData.byteLength > 25 * 1024 * 1024) return json({ error: "Arquivo muito grande. Envie uma foto de ate 25MB." }, 413);

        const folder = String(url.searchParams.get("folder") || "uploads").replace(/[^a-zA-Z0-9_-]/g, "_");
        const key = `${folder}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        await env.MEDIA_BUCKET.put(key, fileData, { httpMetadata: { contentType: mimeType } });

        return json({ url: `${url.origin}/media/${key}`, key });
      }

      if (path.startsWith("/media/")) {
        const key = path.substring(7); // remove "/media/"
        const obj = await env.MEDIA_BUCKET.get(key);
        if (!obj) return new Response("Not Found", { status: 404 });
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
        headers.set("Cache-Control", "public, max-age=31536000");
        return new Response(obj.body, { headers });
      }

      // ==================== WHATSAPP HUB (proxy) ====================
      // A chave do hub fica so aqui no servidor - o admin nunca chama o hub direto do navegador.
      // Usa Service Binding (nao fetch por URL publica - Workers nao podem se chamar via
      // *.workers.dev entre si, a Cloudflare bloqueia isso com o erro 1042).
      if (path === "/hub/messages" && request.method === "POST") {
        if (!env.WHATSAPP_HUB || !env.WHATSAPP_HUB_API_KEY) {
          return json({ error: "Whatsapp Hub nao configurado." }, 500);
        }
        const body = await request.json().catch(() => ({}));
        const hubRes = await env.WHATSAPP_HUB.fetch("https://whatsapp-hub.internal/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.WHATSAPP_HUB_API_KEY}` },
          body: JSON.stringify(body)
        });
        const hubBody = await hubRes.json().catch(() => ({}));
        return json(hubBody, hubRes.status);
      }

      // ==================== QUEUE ====================
      if (path === "/queue/enqueue" && request.method === "POST") {
        const { messages } = await request.json();
        if (!Array.isArray(messages)) return json({ error: "messages must be array" }, 400);
        const batchId = crypto.randomUUID().substring(0, 8);
        const now = Date.now();
        const routedMessages = await distributeWhatsAppInstances(messages, env);
        const writes = routedMessages.map((message, i) => {
          const key = `mq:pending:${now}:${batchId}:${i.toString().padStart(4, "0")}`;
          return env.NIGHTRUN_STORAGE.put(key, JSON.stringify({ ...message, enqueuedAt: new Date().toISOString() }));
        });
        for (let i = 0; i < writes.length; i += 25) {
          await Promise.all(writes.slice(i, i + 25));
        }
        await markQueueHasPending(env);
        ctx?.waitUntil(processQueue(env));
        return json({ success: true, count: routedMessages.length, batchId });
      }

      if (path === "/queue/list" && request.method === "GET") {
        if (!env.NIGHTRUN_STORAGE) return json({ error: "Storage not configured" }, 500);
        try {
          const list = await env.NIGHTRUN_STORAGE.list({ prefix: "mq:pending:", limit: 100 });
          const items = [];
          for (const key of list.keys) {
            try {
              const v = await env.NIGHTRUN_STORAGE.get(key.name);
              if (v) items.push({ key: key.name, ...JSON.parse(v) });
            } catch (e) {
              console.error(`Error parsing message ${key.name}:`, e);
            }
          }
          const paused = await env.NIGHTRUN_STORAGE.get("mq:paused") === "true";
          return json({ success: true, items, paused });
        } catch (err) {
          return json({ error: "Failed to list queue", details: err.message }, 500);
        }
      }

      if (path === "/queue/clear" && request.method === "POST") {
        // Limitado por chamada (rapido e sem travar); o cliente repete ate done=true.
        const list = await env.NIGHTRUN_STORAGE.list({ prefix: "mq:pending:", limit: 200 });
        const dels = list.keys.map(k => env.NIGHTRUN_STORAGE.delete(k.name));
        for (let i = 0; i < dels.length; i += 50) {
          await Promise.all(dels.slice(i, i + 50));
        }
        return json({ success: true, cleared: list.keys.length, done: list.list_complete === true });
      }

      if (path === "/queue/toggle-pause" && request.method === "POST") {
        const cur = await env.NIGHTRUN_STORAGE.get("mq:paused");
        const next = cur === "true" ? "false" : "true";
        await env.NIGHTRUN_STORAGE.put("mq:paused", next);
        return json({ success: true, paused: next === "true" });
      }

      if (path === "/queue/process" && request.method === "POST") {
        const result = await processQueue(env);
        return json({ success: true, message: "Queue processed", ...result });
      }

      // Preview em texto do resumo operacional para uma data (default: dia anterior), sem enviar.
      if (path === "/operational-summary/preview" && request.method === "GET") {
        const ctxDay = brDayContext(Date.now());
        const dateStr = url.searchParams.get("date") || ctxDay.yesterdayStr;
        const range = brRangeForDate(dateStr);
        const report = await buildOperationalReport(env, range, ctxDay.todayStr);
        return json({ success: true, summary: report.summary, totalConfirmadas: report.totalConfirmadas, yesterdayLabel: range.label, preview: report.text });
      }

      // Retorna o PNG do banner (logo + data real) pronto, para o admin conferir antes de enviar.
      if (path === "/operational-summary/banner-preview" && request.method === "GET") {
        const ctxDay = brDayContext(Date.now());
        const dateStr = url.searchParams.get("date") || ctxDay.yesterdayStr;
        const range = brRangeForDate(dateStr);
        try {
          const png = await generateOperationalBannerPng(env, range.shortLabel);
          return new Response(png, { headers: { ...corsHeaders, "Content-Type": "image/png", "Cache-Control": "no-store" } });
        } catch (error) {
          return json({ error: error.message || "Falha ao gerar o banner." }, 500);
        }
      }

      // Envia o resumo do DIA ANTERIOR agora (teste), ignorando horario e trava de "ja enviado".
      if (path === "/operational-summary/send-now" && request.method === "POST") {
        const result = await runOperationalSummary(env, { force: true });
        return json({ success: Boolean(result.sent), ...result });
      }

      // Envio manual para uma data escolhida (hoje ou qualquer data passada).
      if (path === "/operational-summary/send-manual" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const dateStr = String(body.date || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return json({ error: "Informe uma data valida (AAAA-MM-DD)." }, 400);
        const result = await runManualOperationalSummary(env, dateStr);
        return json({ success: Boolean(result.sent), ...result });
      }

      if (path === "/pending-charges/send" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const result = await enqueuePendingCharges(env, {
          template: body.template,
          limit: Number(body.limit || 500)
        });
        ctx?.waitUntil(processQueue(env));
        return json(result);
      }

      // ==================== WHATSAPP DIRECT ====================
      const rawCleanPath = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
      const legacyWhatsAppPath = rawCleanPath.match(/^\/whatsapp\/(status|connect)instanceName=/);
      const cleanPath = legacyWhatsAppPath ? `/whatsapp/${legacyWhatsAppPath[1]}` : rawCleanPath;

      if (cleanPath === "/whatsapp/status" && request.method === "GET") {
        const instanceName = getRequestInstanceName(request, env);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const r = await fetch(`${env.EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
            headers: { apikey: env.EVOLUTION_API_KEY },
            signal: controller.signal
          });
          clearTimeout(timeout);
          const data = await r.json();
          // Normalize: Evolution API v1 returns {instance:{state:"open"}}, v2 may return {state:"open"} or other formats
          const state = data?.instance?.state || data?.state || (r.ok ? "unknown" : "error");
          const normalized = {
            instance: { instanceName, state },
            raw: data,
            httpStatus: r.status
          };
          return json(normalized, 200);
        } catch (e) {
          return json({
            instance: { instanceName, state: "offline" },
            error: true,
            message: "Servidor WhatsApp offline. Verifique se o Docker esta rodando.",
            details: e.message
          }, 200);
        }
      }

      if (cleanPath === "/whatsapp/create" && request.method === "POST") {
        const instanceName = getRequestInstanceName(request, env, await request.clone().json().catch(() => ({})));
        try {
          const r = await fetch(`${env.EVOLUTION_URL}/instance/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: env.EVOLUTION_API_KEY },
            body: JSON.stringify({
              instanceName,
              token: env.EVOLUTION_API_KEY,
              qrcode: true,
              integration: "WHATSAPP-BAILEYS"
            })
          });
          const text = await r.text();
          let data;
          try { data = JSON.parse(text); } catch { data = { raw: text }; }
          if (!r.ok && r.status === 403) {
            const stateResult = await getWhatsAppConnectionState(env, instanceName).catch(error => ({ ok: false, error: error.message }));
            const message = String(data?.message || data?.error || data?.response?.message || data?.raw || "").toLowerCase();
            if (stateResult.ok || message.includes("already") || message.includes("existe") || message.includes("exist")) {
              return json({ success: true, alreadyExists: true, instanceName, createStatus: r.status, createResponse: data, status: stateResult }, 200);
            }
          }
          return json(data, r.status);
        } catch (e) {
          return json({ error: "Failed to connect to Evolution API", details: e.message }, 500);
        }
      }

      if (cleanPath === "/whatsapp/logout" && request.method === "POST") {
        const instanceName = getRequestInstanceName(request, env, await request.clone().json().catch(() => ({})));
        const r = await fetch(`${env.EVOLUTION_URL}/instance/logout/${instanceName}`, {
          method: "DELETE",
          headers: { apikey: env.EVOLUTION_API_KEY }
        });
        let data;
        try { data = await r.json(); } catch { data = { success: r.ok }; }
        return json(data, r.status);
      }

      if (cleanPath === "/whatsapp/reset" && request.method === "POST") {
        const instanceName = getRequestInstanceName(request, env, await request.clone().json().catch(() => ({})));
        const steps = [];
        for (const step of [
          { name: "logout", url: `${env.EVOLUTION_URL}/instance/logout/${instanceName}`, method: "DELETE" },
          { name: "delete", url: `${env.EVOLUTION_URL}/instance/delete/${instanceName}`, method: "DELETE" },
        ]) {
          try {
            const r = await fetch(step.url, { method: step.method, headers: { apikey: env.EVOLUTION_API_KEY } });
            const bodyText = await r.text();
            let body;
            try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }
            steps.push({ name: step.name, ok: r.ok, status: r.status, body });
          } catch (error) {
            steps.push({ name: step.name, ok: false, error: error.message });
          }
        }

        const createRes = await fetch(`${env.EVOLUTION_URL}/instance/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: env.EVOLUTION_API_KEY },
          body: JSON.stringify({
            instanceName,
            token: env.EVOLUTION_API_KEY,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS"
          })
        });
        const createText = await createRes.text();
        let createData;
        try { createData = createText ? JSON.parse(createText) : {}; } catch { createData = { raw: createText }; }
        steps.push({ name: "create", ok: createRes.ok, status: createRes.status, body: createData });
        const failedStep = steps.find(step => !step.ok);
        const message = failedStep
          ? `Falha no reset do WhatsApp na etapa ${failedStep.name}${failedStep.status ? ` (${failedStep.status})` : ""}.`
          : "Sessao resetada.";

        return json({ success: createRes.ok, message, steps }, createRes.ok ? 200 : 502);
      }

      if (cleanPath === "/whatsapp/connect" && request.method === "GET") {
        const instanceName = getRequestInstanceName(request, env);
        const r = await fetch(`${env.EVOLUTION_URL}/instance/connect/${instanceName}`, {
          headers: { apikey: env.EVOLUTION_API_KEY }
        });
        return json(await r.json(), r.status);
      }

      if (cleanPath === "/whatsapp/send" && request.method === "POST") {
        const body = await request.json();
        const result = await sendMessageWithFallback(body, env);
        return json(result);
      }

      // ==================== 1000 CONFIRMADOS ====================
      if (cleanPath === "/thousand/status" && request.method === "GET") {
        const counterDoc = await getFirestoreDocSafe(env, THOUSAND_COUNTER_DOC);
        const broadcastDoc = await getFirestoreDocSafe(env, THOUSAND_BROADCAST_DOC);
        const numbers = (broadcastDoc?.fields?.numbers?.arrayValue?.values || []).map(v => v.stringValue).filter(Boolean);
        return json({
          count: Number(counterDoc?.fields?.count?.integerValue || 0),
          sent: broadcastDoc?.fields?.sent?.booleanValue === true,
          sentAt: broadcastDoc?.fields?.sentAt?.timestampValue || null,
          numbers
        });
      }

      if (cleanPath === "/thousand/numbers" && request.method === "POST") {
        const body = await request.json();
        const numbers = Array.isArray(body.numbers) ? body.numbers.map(n => String(n || "").trim()).filter(Boolean) : [];
        await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${THOUSAND_BROADCAST_DOC}?key=${env.FIREBASE_API_KEY}&updateMask.fieldPaths=numbers`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { numbers: { arrayValue: { values: numbers.map(n => ({ stringValue: n })) } } } })
        });
        return json({ success: true, numbers });
      }

      if (cleanPath === "/thousand/banner-preview" && request.method === "GET") {
        const roster = await fetchConfirmedRosterForBroadcast(env);
        const png = await generateThousandCelebrationBannerPng(env, roster);
        return new Response(png, { headers: { "Content-Type": "image/png", ...corsHeaders } });
      }

      if (cleanPath === "/thousand/test-broadcast" && request.method === "POST") {
        const dryRun = url.searchParams.get("dry") === "1";
        // Sincrono (nao waitUntil): a geracao + envio ficam dentro do limite de CPU do
        // Worker (sem fotos no PDF), e o tempo de resposta em si nao tem limite rigido
        // enquanto for I/O (esperando rede) - so o waitUntil() tem uma janela curta demais
        // pra esse fluxo completo, entao esperamos terminar antes de responder.
        const result = await triggerThousandBroadcast(env, ctx, { test: true, dryRun });
        return json(result);
      }

      // ==================== DOCS ====================
      if (cleanPath === "/docs" || cleanPath === "/") {
        return new Response(`<html><head><title>MCU Night Run API</title></head><body style="font-family:system-ui;background:#1B2150;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#D4E926;font-size:2.5rem">MCU Night Run API</h1><p>Worker ativo ✓</p><p style="opacity:.5;margin-top:20px">Endpoints: /asaas/*, /media/*, /queue/*, /whatsapp/*</p></div></body></html>`, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders }
        });
      }

      return json({ error: "Not Found", path, cleanPath }, 404);
    } catch (err) {
      console.error("[Worker] Unhandled error", { path, message: err?.message, stack: err?.stack });
      return json({ error: err.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(keepWhatsAppAlive(env));
    ctx.waitUntil(maybeSnapshotBalances(env).catch(error => console.error("[OpSummary] balance snapshot failed", error)));
    ctx.waitUntil(runOperationalSummary(env).catch(error => console.error("[OpSummary] scheduled failed", error)));
    // A cada 5 minutos (nao todo tick de 1 min, pra nao estourar limite de API do Cora/Asaas):
    // confirma sozinho qualquer pagamento pendente que ja esteja pago no banco - rede de
    // seguranca contra webhook perdido/atrasado ou troca de forma de pagamento no checkout.
    if (new Date().getMinutes() % 5 === 0) {
      ctx.waitUntil(autoReconcilePendingPayments(env, ctx).catch(error => console.error("[Auto Reconcile] scheduled failed", error)));
    }
    // Rede de seguranca do limite de 1000 confirmados: todo minuto, recalibra o contador
    // contra a contagem real do Firestore (corrige qualquer caminho que confirme pagamento
    // sem passar por confirmRegistrationDocument) e dispara o aviso se ja tiver cruzado 1000.
    // AWAIT direto (nao ctx.waitUntil) de proposito: o disparo de verdade (gerar banner+PDF
    // e mandar pro WhatsApp) demora mais do que a janela extra que o waitUntil() ganha depois
    // do handler "terminar" - so fica confiavel fazendo parte da execucao principal do cron,
    // que nao tem essa limitacao (nao esta amarrada a uma resposta HTTP esperando ninguem).
    await recalibrateConfirmedCounter(env, ctx).catch(error => console.error("[Thousand] recalibration scheduled failed", error));
    await processQueue(env);
  }
};

// ==================== HELPERS ====================

function formatPhoneForWhatsApp(phone) {
  const clean = String(phone || "").replace(/\D/g, "");
  return clean.startsWith("55") ? clean : `55${clean}`;
}

function getDefaultInstanceName(env) {
  return env.INSTANCE_NAME || "mcu_nightrun_uba";
}

function getRequestInstanceName(request, env, body = {}) {
  const url = new URL(request.url);
  const legacyMatch = url.pathname.match(/^\/whatsapp\/(?:status|connect)instanceName=(.+)$/);
  return String(
    url.searchParams.get("instanceName") ||
    (legacyMatch ? decodeURIComponent(legacyMatch[1]) : "") ||
    body.instanceName ||
    getDefaultInstanceName(env)
  ).trim();
}

function firestoreValueToJs(value) {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(firestoreValueToJs);
  if ("mapValue" in value) {
    const out = {};
    for (const [key, item] of Object.entries(value.mapValue.fields || {})) out[key] = firestoreValueToJs(item);
    return out;
  }
  return undefined;
}

function firestoreDocumentFieldsToJs(fields = {}) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = firestoreValueToJs(value);
  return out;
}

async function getActiveWhatsAppInstances(env) {
  const fallback = [{ instanceName: getDefaultInstanceName(env), label: "Principal", active: true }];
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_API_KEY) return fallback;

  const readInstancesDoc = async (collection, id) => {
    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${id}?key=${env.FIREBASE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const instances = firestoreValueToJs(data.fields?.instances);
    return Array.isArray(instances)
      ? instances
          .filter(item => item?.active !== false && item?.instanceName)
          .map(item => ({ ...item, instanceName: String(item.instanceName).trim() }))
      : [];
  };

  try {
    const publicActive = await readInstancesDoc("nightrun_settings", "whatsapp_numbers_public");
    if (publicActive.length) return publicActive;

    const active = await readInstancesDoc("system_settings", "nightrun_whatsapp_numbers");
    return active.length ? active : fallback;
  } catch (error) {
    console.error("[WhatsApp Instances] Failed to load", error);
    return fallback;
  }
}

async function getPaymentConfirmationWhatsAppConfig(env) {
  const fallback = { instanceName: getDefaultInstanceName(env), adminPhone: "" };
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_API_KEY) return fallback;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/system_settings/nightrun_whatsapp?key=${env.FIREBASE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const data = await res.json();
    return {
      instanceName: firestoreString(data.fields?.instanceName) || fallback.instanceName,
      adminPhone: formatPhoneForWhatsApp(firestoreString(data.fields?.registrationNoticePhone))
    };
  } catch (error) {
    console.error("[Payment Confirm] Failed to load WhatsApp config", error);
    return fallback;
  }
}

async function getPaymentMethodsSettings(env) {
  const fallback = { pix: true, cartao: true };
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_API_KEY) return fallback;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_settings/payment_methods?key=${env.FIREBASE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const data = await res.json();
    return {
      pix: data.fields?.pix?.booleanValue !== false,
      cartao: data.fields?.cartao?.booleanValue !== false,
    };
  } catch (error) {
    console.error("[Payment Methods] Failed to load settings", error);
    return fallback;
  }
}

async function chooseWhatsAppInstance(env, explicitInstanceName = "") {
  if (explicitInstanceName) return { instanceName: explicitInstanceName, source: "message" };
  const instances = await getConnectedWhatsAppInstances(env);
  if (instances.length === 1) return { ...instances[0], source: "single" };

  const current = Number(await env.NIGHTRUN_STORAGE.get("whatsapp:rr:index") || 0);
  const selected = instances[current % instances.length];
  await env.NIGHTRUN_STORAGE.put("whatsapp:rr:index", String(current + 1));
  return { ...selected, source: "round_robin", activeCount: instances.length };
}

async function distributeWhatsAppInstances(messages, env) {
  const instances = await getConnectedWhatsAppInstances(env);
  if (!instances.length) return messages;

  const current = Number(await env.NIGHTRUN_STORAGE.get("whatsapp:rr:index") || 0);
  let offset = 0;
  const routed = messages.map(message => {
    if (message.instanceName) return message;
    const selected = instances[(current + offset) % instances.length];
    offset++;
    return {
      ...message,
      instanceName: selected.instanceName,
      instanceLabel: selected.label || selected.instanceName,
      instanceRouting: instances.length === 1 ? "single" : "queue_round_robin",
    };
  });

  if (offset > 0) {
    await env.NIGHTRUN_STORAGE.put("whatsapp:rr:index", String(current + offset));
  }

  return routed;
}

async function getConnectedWhatsAppInstances(env) {
  const active = await getActiveWhatsAppInstances(env);
  const checked = await Promise.allSettled(active.map(async instance => {
    const state = await getWhatsAppConnectionState(env, instance.instanceName);
    return { ...instance, connectionState: state.state, connectionOk: state.ok };
  }));

  const connected = checked
    .filter(item => item.status === "fulfilled")
    .map(item => item.value)
    .filter(item => item.connectionState === "open");

  if (connected.length) return connected;
  console.warn("[WhatsApp Instances] No connected active instance found. Falling back to active list.", {
    active: active.map(item => item.instanceName),
    checked: checked.map(item => item.status === "fulfilled" ? item.value : { error: item.reason?.message })
  });
  return active;
}

function buildPaymentConfirmationText(nome, modalidadeNome) {
  const modalidade = String(modalidadeNome || "").trim() || "MCU Night Run";
  return `Pagamento confirmado!\n\n` +
    `Ol\u00e1 ${nome}! Sua inscri\u00e7\u00e3o na Manhua\u00e7u Night Run 2026 est\u00e1 garantida.\n\n` +
    `Data: 12/09\n` +
    `Local: Estadio JK\n` +
    `Modalidade: ${modalidade}\n\n` +
    `Entre no grupo exclusivo de participantes no WhatsApp para ficar por dentro de todos os detalhes da corrida:\nhttps://chat.whatsapp.com/LdM79ltwcWpHRdgfSlm8tz\n\n` +
    `Nos acompanhe pelas redes sociais:\nInstagram: https://www.instagram.com/nightrunmcu\n\n` +
    `Compartilhe seu card #EUVOU em todas as redes sociais!`;
}

const DEFAULT_PENDING_CHARGE_TEMPLATE =
  "Olá {nome}! Tudo bem\n\n" +
  "Seu pagamento da inscrição na MCU Night Run 2026 ainda não foi registrado no sistema.\n\n" +
  "Aceitamos pagamento via Pix e cartão de débito/crédito.\n\n" +
  "Para garantir sua vaga, acesse o link de pagamento:\n{link_pagamento}\n\n" +
  "Se você já pagou, basta nos enviar o comprovante por este WhatsApp para conferirmos e garantir sua vaga.";

const PAYMENT_PAGE_BASE_URL = "https://mcunightrun.com.br/inscricao/pagamento";

async function enqueuePendingCharges(env, options = {}) {
  const template = String(options.template || await getPendingChargeTemplate(env) || DEFAULT_PENDING_CHARGE_TEMPLATE);
  const pending = await listPendingRegistrations(env, options.limit || 500);
  const messages = pending
    .filter(registration => formatPhoneForWhatsApp(registration.telefone))
    .map(registration => ({
      phone: formatPhoneForWhatsApp(registration.telefone),
      text: fillPendingChargeTemplate(template, registration),
      alunoNome: registration.nome,
      registrationId: registration.registrationId,
      type: "pending_charge"
    }));

  if (messages.length === 0) {
    return { success: true, count: 0, totalPending: pending.length, message: "Nenhum pendente com telefone encontrado." };
  }

  const routedMessages = await distributeWhatsAppInstances(messages, env);
  const batchId = crypto.randomUUID().substring(0, 8);
  const now = Date.now();
  for (let i = 0; i < routedMessages.length; i += 25) {
    await Promise.all(routedMessages.slice(i, i + 25).map((message, offset) => {
      const index = i + offset;
      const key = `mq:pending:${now}:${batchId}:${index.toString().padStart(4, "0")}`;
      return env.NIGHTRUN_STORAGE.put(key, JSON.stringify({ ...message, enqueuedAt: new Date().toISOString() }));
    }));
  }
  await markQueueHasPending(env);

  return { success: true, count: routedMessages.length, totalPending: pending.length, batchId };
}

async function getPendingChargeTemplate(env) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/system_settings/nightrun_pending_charge?key=${env.FIREBASE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return "";
    const data = await res.json();
    return firestoreString(data.fields?.template);
  } catch (error) {
    console.error("[Pending Charges] Failed to read template", error);
    return "";
  }
}

function fillPendingChargeTemplate(template, registration) {
  const id = registration.registrationId || registration.id || "";
  return String(template || DEFAULT_PENDING_CHARGE_TEMPLATE)
    .replaceAll("{nome}", String(registration.nome || "Atleta").split(" ")[0] || "Atleta")
    .replaceAll("{nome_completo}", registration.nome || "Atleta")
    .replaceAll("{link_pagamento}", id ? `${PAYMENT_PAGE_BASE_URL}/${id}` : "Link de pagamento não disponível")
    .replaceAll("{valor}", (Number(registration.amount || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
}

function getCoraBaseUrl(env) {
  return String(env.CORA_BASE_URL || "https://matls-clients.api.cora.com.br").replace(/\/+$/, "");
}

function getCoraFetcher(env) {
  return env.CORA_AUTH_MODE === "direct" && env.CORA_MTLS?.fetch
    ? env.CORA_MTLS
    : { fetch };
}

// Cacheia o token de acesso da Cora no KV entre chamadas - ANTES desta correção, toda
// checagem de pagamento, criação de fatura, consulta de saldo etc pedia um token NOVO na Cora
// a cada chamada, sem reaproveitar nada. Uma unica auditoria varrendo ~150 inscrições
// pendentes gerava ~150 pedidos de token em poucos segundos, estourando o limite de taxa da
// Cora pra esse endpoint - e como a autenticação falhava, a checagem de pagamento também
// falhava silenciosamente ("bankError: Falha ao autenticar na Cora"), deixando pagamentos já
// aprovados presos como "pendente" no sistema por horas até alguém verificar manualmente.
async function getCoraAccessToken(env) {
  if (!env.CORA_CLIENT_ID) throw new Error("CORA_CLIENT_ID nao configurado.");

  if (env.NIGHTRUN_STORAGE) {
    const cached = await env.NIGHTRUN_STORAGE.get("cora:access-token");
    if (cached) return cached;
  }

  const baseUrl = getCoraBaseUrl(env);
  const fetcher = getCoraFetcher(env);
  const isDirect = (env.CORA_AUTH_MODE || "direct") === "direct";
  const tokenUrl = isDirect ? `${baseUrl}/token` : `${baseUrl}/oauth/token`;
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  const body = isDirect
    ? new URLSearchParams({ grant_type: "client_credentials", client_id: env.CORA_CLIENT_ID })
    : new URLSearchParams({ grant_type: "client_credentials" });

  if (!isDirect) {
    if (!env.CORA_CLIENT_SECRET) throw new Error("CORA_CLIENT_SECRET nao configurado.");
    headers.Authorization = `Basic ${btoa(`${env.CORA_CLIENT_ID}:${env.CORA_CLIENT_SECRET}`)}`;
  }

  const res = await fetcher.fetch(tokenUrl, { method: "POST", headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.message || data.error_description || data.error || "Falha ao autenticar na Cora.");
  }

  if (env.NIGHTRUN_STORAGE) {
    // TTL do KV precisa ser >=60s. Usa o expires_in que a Cora informar com uma margem de
    // seguranca de 30s; se a Cora nao informar expires_in, usa 5 minutos por padrao (bem
    // conservador - tokens OAuth client_credentials normalmente duram bem mais que isso).
    const expiresIn = Number(data.expires_in || 0);
    const ttl = Math.max(60, expiresIn > 60 ? expiresIn - 30 : 300);
    await env.NIGHTRUN_STORAGE.put("cora:access-token", data.access_token, { expirationTtl: ttl });
  }

  return data.access_token;
}

async function createCoraPixInvoice(env, input) {
  const accessToken = await getCoraAccessToken(env);
  const baseUrl = getCoraBaseUrl(env);
  const fetcher = getCoraFetcher(env);
  const customer = input.customer || {};
  const address = customer.address || {};
  const document = String(customer.document || "").replace(/\D/g, "");
  const baseCode = input.code || `mcu-${crypto.randomUUID()}`;
  const payload = {
    code: baseCode,
    customer: {
      name: customer.name || "Atleta MCU Night Run",
      email: customer.email || "contato@mcunightrun.com.br",
      document: {
        identity: document,
        type: document.length === 14 ? "CNPJ" : "CPF"
      },
      address: {
        street: address.rua || address.street || "Nao informado",
        number: address.numero || address.number || "S/N",
        district: address.bairro || address.district || "Nao informado",
        city: address.cidade || address.city || "Manhuacu",
        state: address.uf || address.state || "MG",
        complement: address.complemento || address.complement || "N/A",
        zip_code: String(address.cep || address.zip_code || "36900000").replace(/\D/g, "")
      }
    },
    services: [{
      name: "Inscricao MCU Night Run 2026",
      description: input.description || "Inscricao MCU Night Run 2026",
      amount: Number(input.amount || 0)
    }],
    payment_terms: {
      due_date: input.dueDate
    },
    payment_forms: ["PIX"]
  };

  let res;
  let data;
  for (let attempt = 0; attempt < 3; attempt++) {
    const attemptPayload = attempt === 0
      ? payload
      : { ...payload, code: `${baseCode}-${attempt}`.slice(0, 60) };
    res = await fetcher.fetch(`${baseUrl}/v2/invoices/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify(attemptPayload)
    });
    data = await res.json().catch(() => ({}));
    if (res.ok || !isCoraCipRegistrationError(data)) {
      payload.code = attemptPayload.code;
      break;
    }
    await sleep(400 * (attempt + 1));
  }
  if (!res.ok) return { status: res.status, body: data };

  return {
    status: res.status,
    body: {
      provider: "cora",
      id: data.id || data.invoice_id || "",
      code: data.code || payload.code,
      invoiceUrl: data.payment_options?.bank_slip?.url || data.url || "",
      pixPayload: data.pix?.emv || data.payment_options?.pix?.emv || "",
      raw: data
    }
  };
}

function isCoraCipRegistrationError(data) {
  const message = String(data?.message || data?.error || data?.errors?.[0]?.message || "").toLowerCase();
  return message.includes("bank slip not registered in cip");
}

function firstNumericValue(data, keys) {
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return 0;
}

function normalizeMoneyToCents(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function normalizeCoraMoneyToCents(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric);
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function collectListItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.transactions)) return data.transactions;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.statement)) return data.statement;
  if (Array.isArray(data?.entries)) return data.entries;
  return [];
}

function readNestedValue(item, paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, key) => acc?.[key], item);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function transactionTypeLabel(type) {
  const normalized = cleanText(type).toUpperCase();
  const labels = {
    PAYMENT: "Pagamento recebido",
    PIX: "Pix",
    FEE: "Taxa bancária",
    TRANSFER: "Transferência",
    TED: "TED",
    BOLETO: "Boleto",
    REFUND: "Estorno",
    CHARGEBACK: "Contestação",
    CREDIT: "Crédito",
    DEBIT: "Débito"
  };
  return labels[normalized] || (normalized ? normalized[0] + normalized.slice(1).toLowerCase() : "");
}

function normalizeBankDate(value) {
  if (!value) return new Date().toISOString();
  // A Cora manda createdAt tipo "2026-08-17T22:45:54+00" (offset sem minutos) - o Date()
  // do V8 recusa esse formato e vira "Invalid Date", fazendo a data cair silenciosamente
  // pra "agora". Completa o offset com ":00" antes de parsear.
  const normalized = typeof value === "string" ? value.replace(/([+-]\d{2})$/, "$1:00") : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeAsaasMovement(item) {
  const rawValue = readNestedValue(item, ["value", "amount", "netValue", "balance", "feeValue"]);
  const valueNumber = Number(rawValue || 0);
  const typeText = String(item.type || item.transactionType || item.operationType || item.description || "").toUpperCase();
  // O campo "value" do extrato do Asaas ja vem com sinal (positivo = entrada, negativo = saida) -
  // esse sinal e a fonte de verdade. So cai no regex de texto quando o valor vier zerado/ausente,
  // porque um regex generico (ex: "PAYMENT") classificava PAYMENT_RECEIVED (entrada) como saida.
  const isDebit = valueNumber !== 0
    ? valueNumber < 0
    : /DEBIT|FEE|TAX|TARIFA|SAQUE|TRANSFER|ANTICIPATION_DEBIT|CHARGEBACK|REFUND/.test(typeText);
  const cents = Math.abs(normalizeMoneyToCents(valueNumber));
  const typeLabel = transactionTypeLabel(item.type || item.transactionType || item.operationType);
  const description = cleanText(item.description || item.title || item.payment?.description || item.paymentDescription);
  // O extrato de financialTransactions do Asaas nao devolve o objeto do cliente/pagador -
  // so ha um texto solto tipo "Cobranca recebida - fatura nr. 860839104 Fulano da Silva".
  // Quando nao ha campo estruturado de pagador, extrai o nome do fim dessa descricao.
  const payerFromDescriptionMatch = /fatura\s+nr\.?\s*\d+\s+(.+)$/i.exec(description);
  const payerFromDescription = payerFromDescriptionMatch ? cleanText(payerFromDescriptionMatch[1]) : "";
  const payer = cleanText(item.customer?.name || item.client?.name || item.payer?.name || item.transfer?.recipientName) || payerFromDescription;
  const title = description || typeLabel || (isDebit ? "Saída Asaas" : "Entrada Asaas");
  const paymentId = cleanText(item.paymentId || item.payment || item.transferId || item.invoiceId || item.object);
  const detailParts = [
    typeLabel && typeLabel !== title ? typeLabel : "",
    payer,
    paymentId
  ].filter(Boolean);
  return {
    id: String(item.id || item.transactionId || item.object || `${item.date || item.transactionDate || ""}-${rawValue}-${item.description || typeText}`),
    provider: "asaas",
    type: isDebit ? "saida" : "entrada",
    date: normalizeBankDate(item.date || item.transactionDate || item.createdDate || item.effectiveDate || item.paymentDate),
    amount: cents,
    title,
    description: detailParts.join(" • ") || "Movimentação real do extrato Asaas",
    paymentId,
    payerName: payer,
    raw: item
  };
}

function normalizeCoraMovement(item, forcedType) {
  const rawValue = readNestedValue(item, ["amount", "value", "transaction.amount", "transaction.value", "totalAmount", "total_amount"]);
  const valueNumber = Number(rawValue || 0);
  const typeText = String(forcedType || item.type || item.operationType || item.transaction_type || item.transactionType || item.transaction?.type || "").toUpperCase();
  const isDebit = valueNumber < 0 || typeText.includes("DEBIT");
  const cents = Math.abs(normalizeCoraMoneyToCents(valueNumber));
  const transaction = item.transaction || {};
  const transactionLabel = transactionTypeLabel(transaction.type || typeText);
  const transactionDescription = cleanText(transaction.description || item.description || item.title);
  const counterPartyName = cleanText(transaction.counterParty?.name || item.counterparty?.name || item.recipient?.name || item.sender?.name);
  const categoryMain = cleanText(transaction.category?.main || item.category?.main || item.category);
  const categorySub = cleanText(transaction.category?.sub || item.subcategory);
  const title = transactionDescription || transactionLabel || (isDebit ? "Saída Cora" : "Entrada Cora");
  const chargeId = cleanText(readNestedValue(item, [
    "transaction.invoice.id", "transaction.invoice.code", "transaction.invoiceId", "transaction.invoiceCode",
    "invoice.id", "invoice.code", "invoiceId", "invoiceCode", "transaction.entryId", "entryId"
  ]));
  const detailParts = [
    transactionLabel && transactionLabel !== title ? transactionLabel : "",
    counterPartyName,
    categoryMain || categorySub ? [categoryMain, categorySub].filter(Boolean).join(" / ") : ""
  ].filter(Boolean);
  return {
    id: String(item.id || item.transaction_id || item.transactionId || item.code || `${item.date || item.created_at || ""}-${rawValue}-${item.description || typeText}`),
    provider: "cora",
    type: isDebit ? "saida" : "entrada",
    date: normalizeBankDate(item.date || item.created_at || item.createdAt || item.transaction_date || item.transactionDate),
    amount: cents,
    title,
    description: detailParts.join(" • ") || "Movimentação real do extrato Cora",
    chargeId,
    counterPartyName,
    payerName: counterPartyName,
    raw: item
  };
}

async function getAsaasMovements(env, { start, end }) {
  const limit = 100;
  let offset = 0;
  const rawItems = [];
  let lastData = {};
  for (let page = 0; page < 100; page++) {
    const requestUrl = new URL(`${env.ASAAS_BASE_URL}/financialTransactions`);
    requestUrl.searchParams.set("limit", String(limit));
    requestUrl.searchParams.set("offset", String(offset));
    requestUrl.searchParams.set("startDate", start);
    requestUrl.searchParams.set("finishDate", end);
    requestUrl.searchParams.set("order", "desc");

    const res = await fetch(requestUrl.toString(), {
      headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0", "accept": "application/json" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data.errors?.[0]?.description || data.message || data.error || "Falha ao consultar extrato Asaas.", items: [], raw: data };
    lastData = data;
    const pageItems = collectListItems(data);
    rawItems.push(...pageItems);
    if (!data.hasMore || pageItems.length === 0) break;
    offset += limit;
  }
  const items = rawItems.map(normalizeAsaasMovement).filter(item => item.amount > 0);
  return {
    ok: true,
    status: 200,
    items,
    entradas: items.filter(item => item.type === "entrada"),
    saidas: items.filter(item => item.type === "saida"),
    raw: lastData
  };
}

async function getCoraStatementPage(env, { start, end, type }) {
  const accessToken = await getCoraAccessToken(env);
  const baseUrl = getCoraBaseUrl(env);
  const fetcher = getCoraFetcher(env);
  const perPage = 100;
  const items = [];
  let lastData = {};
  for (let page = 1; page <= 100; page++) {
    const requestUrl = new URL(`${baseUrl}/bank-statement/statement`);
    requestUrl.searchParams.set("start", start);
    requestUrl.searchParams.set("end", end);
    requestUrl.searchParams.set("type", type);
    requestUrl.searchParams.set("page", String(page));
    requestUrl.searchParams.set("perPage", String(perPage));
    requestUrl.searchParams.set("aggr", "false");

    const res = await fetcher.fetch(requestUrl.toString(), {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data.message || data.error_description || data.error || "Falha ao consultar extrato Cora.", items: [], raw: data };
    lastData = data;
    const pageItems = collectListItems(data);
    items.push(...pageItems);
    const hasNext = Boolean(data.has_more || data.hasMore || data.next_page || data.pagination?.next_page);
    if (!hasNext && pageItems.length < perPage) break;
    if (pageItems.length === 0) break;
  }
  return { ok: true, status: 200, items, raw: lastData };
}

async function getCoraMovements(env, { start, end }) {
  const [credit, debit] = await Promise.allSettled([
    getCoraStatementPage(env, { start, end, type: "CREDIT" }),
    getCoraStatementPage(env, { start, end, type: "DEBIT" })
  ]);
  const failures = [credit, debit].filter(result => result.status === "fulfilled" && !result.value.ok);
  if (credit.status === "rejected" && debit.status === "rejected") {
    throw new Error(credit.reason?.message || debit.reason?.message || "Falha ao consultar extrato Cora.");
  }
  const creditItems = credit.status === "fulfilled" && credit.value.ok ? credit.value.items.map(item => normalizeCoraMovement(item, "CREDIT")) : [];
  const debitItems = debit.status === "fulfilled" && debit.value.ok ? debit.value.items.map(item => normalizeCoraMovement(item, "DEBIT")) : [];
  const items = [...creditItems, ...debitItems]
    .filter(item => item.amount > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return {
    ok: failures.length === 0,
    status: failures[0]?.value?.status || 200,
    error: failures[0]?.value?.error,
    items,
    entradas: items.filter(item => item.type === "entrada"),
    saidas: items.filter(item => item.type === "saida"),
    raw: {
      credit: credit.status === "fulfilled" ? credit.value.raw : String(credit.reason?.message || credit.reason || ""),
      debit: debit.status === "fulfilled" ? debit.value.raw : String(debit.reason?.message || debit.reason || "")
    }
  };
}

function normalizeInvoiceStatus(value) {
  const status = cleanText(value).toUpperCase();
  const labels = {
    PENDING: "Pendente",
    CREATED: "Criada",
    OPEN: "Aberta",
    OVERDUE: "Vencida",
    RECEIVED: "Recebida",
    CONFIRMED: "Confirmada",
    PAID: "Paga",
    REFUNDED: "Estornada",
    CANCELLED: "Cancelada",
    CANCELED: "Cancelada",
    DELETED: "Excluida"
  };
  return labels[status] || (status ? status[0] + status.slice(1).toLowerCase() : "Sem status");
}

function normalizeAsaasInvoice(item) {
  const amount = Number(item.value ?? item.originalValue ?? item.netValue ?? 0);
  return {
    id: String(item.id || ""),
    provider: "asaas",
    customer: cleanText(item.customerName || item.customer?.name || item.description || "Cliente Asaas"),
    description: cleanText(item.description || item.externalReference || ""),
    amount: normalizeMoneyToCents(amount),
    dueDate: item.dueDate || item.originalDueDate || "",
    createdAt: item.dateCreated || item.createdAt || "",
    status: String(item.status || ""),
    statusLabel: normalizeInvoiceStatus(item.status),
    invoiceUrl: item.invoiceUrl || item.bankSlipUrl || item.transactionReceiptUrl || "",
    raw: item
  };
}

function normalizeCoraInvoice(item) {
  const services = Array.isArray(item.services) ? item.services : [];
  const servicesAmount = services.reduce((sum, service) => sum + Number(service.amount || 0), 0);
  const amount = readNestedValue(item, ["total_amount", "totalAmount", "amount", "payment_terms.amount"]) ?? servicesAmount;
  return {
    id: String(item.id || item.invoice_id || item.code || ""),
    provider: "cora",
    customer: cleanText(item.customer?.name || item.payer?.name || item.customer_name || "Cliente Cora"),
    description: cleanText(item.description || services[0]?.description || services[0]?.name || item.code || ""),
    amount: normalizeCoraMoneyToCents(amount),
    dueDate: readNestedValue(item, ["payment_terms.due_date", "due_date", "dueDate"]) || "",
    createdAt: item.created_at || item.createdAt || item.issue_date || "",
    status: String(item.status || ""),
    statusLabel: normalizeInvoiceStatus(item.status),
    invoiceUrl: readNestedValue(item, ["payment_options.bank_slip.url", "bank_slip.url", "invoice_url", "url"]) || "",
    raw: item
  };
}

async function getAsaasInvoices(env) {
  const items = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 100; page++) {
    const requestUrl = new URL(`${env.ASAAS_BASE_URL}/payments`);
    requestUrl.searchParams.set("limit", String(limit));
    requestUrl.searchParams.set("offset", String(offset));
    const res = await fetch(requestUrl.toString(), {
      headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0", "accept": "application/json" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data.errors?.[0]?.description || data.message || data.error || "Falha ao consultar faturas Asaas.", items: [] };
    }
    const pageItems = collectListItems(data);
    items.push(...pageItems);
    if (!data.hasMore || pageItems.length === 0) break;
    offset += limit;
  }
  return { ok: true, provider: "asaas", items: items.map(normalizeAsaasInvoice).filter(item => item.id), total: items.length };
}

async function getCoraInvoices(env) {
  const accessToken = await getCoraAccessToken(env);
  const baseUrl = getCoraBaseUrl(env);
  const fetcher = getCoraFetcher(env);
  const items = [];
  const perPage = 100;
  for (let page = 1; page <= 100; page++) {
    const requestUrl = new URL(`${baseUrl}/v2/invoices/`);
    requestUrl.searchParams.set("page", String(page));
    requestUrl.searchParams.set("perPage", String(perPage));
    const res = await fetcher.fetch(requestUrl.toString(), {
      headers: { "Accept": "application/json", "Authorization": `Bearer ${accessToken}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data.message || data.error_description || data.error || "Falha ao consultar faturas Cora.", items: [] };
    }
    const pageItems = collectListItems(data);
    items.push(...pageItems);
    const hasNext = Boolean(data.has_more || data.hasMore || data.next_page || data.pagination?.next_page);
    if (!hasNext && pageItems.length < perPage) break;
    if (pageItems.length === 0) break;
  }
  return { ok: true, provider: "cora", items: items.map(normalizeCoraInvoice).filter(item => item.id), total: items.length };
}

async function deleteAsaasInvoice(env, invoiceId) {
  const res = await fetch(`${env.ASAAS_BASE_URL}/payments/${encodeURIComponent(invoiceId)}`, {
    method: "DELETE",
    headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0", "accept": "application/json" }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.errors?.[0]?.description || data.message || data.error || "Nao foi possivel excluir a fatura Asaas." };
  return { ok: true, provider: "asaas", id: invoiceId, deleted: data.deleted !== false };
}

async function deleteAsaasInvoicesBulk(env, ids) {
  const results = [];
  for (const id of ids.slice(0, 200)) {
    const result = await deleteAsaasInvoice(env, id);
    results.push({ id, ...result });
  }
  const deletedCount = results.filter(item => item.ok).length;
  return {
    ok: true,
    requestedCount: ids.length,
    processedCount: results.length,
    deletedCount,
    errorCount: results.length - deletedCount,
    results
  };
}

function getRegistrationAsaasPaymentId(registration) {
  return cleanText(registration.creditCardAsaasPaymentId || registration.asaasPaymentId || (
    registration.paymentProvider !== "cora" ? registration.paymentExternalId : ""
  ));
}

function isAsaasPaidStatus(status) {
  return ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(String(status || "").toUpperCase());
}

function isAsaasPendingStatus(status) {
  return ["PENDING", "OVERDUE"].includes(String(status || "").toUpperCase());
}

function paidDateForReceiveInCash(registration) {
  const value = registration.manualPaymentConfirmedAt || registration.paymentConfirmedAt || registration.paidAt || registration.updatedAt || registration.createdAt;
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? formatDateOnly(new Date()) : formatDateOnly(date);
}

async function getAsaasPayment(env, paymentId) {
  const res = await fetch(`${env.ASAAS_BASE_URL}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0", "accept": "application/json" }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, notFound: res.status === 404, error: data.errors?.[0]?.description || data.message || data.error || "Falha ao consultar fatura Asaas.", raw: data };
  }
  return { ok: true, status: res.status, rawStatus: data.status || "", raw: data };
}

async function receiveAsaasPaymentInCash(env, paymentId, registration) {
  const payload = {
    paymentDate: paidDateForReceiveInCash(registration),
    value: Number(registration.amount || 0) / 100,
    notifyCustomer: false
  };
  const res = await fetch(`${env.ASAAS_BASE_URL}/payments/${encodeURIComponent(paymentId)}/receiveInCash`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0", "accept": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: data.errors?.[0]?.description || data.message || data.error || "Nao foi possivel marcar a fatura como recebida no Asaas.", raw: data };
  }
  return { ok: true, status: res.status, raw: data };
}

async function listAsaasRegistrations(env) {
  const docs = [];
  let pageToken = "";
  while (docs.length < 1000) {
    const pageSize = 300;
    const pageUrl = new URL(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_registrations`);
    pageUrl.searchParams.set("key", env.FIREBASE_API_KEY);
    pageUrl.searchParams.set("pageSize", String(pageSize));
    if (pageToken) pageUrl.searchParams.set("pageToken", pageToken);
    const res = await fetch(pageUrl.toString());
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || "Falha ao listar inscricoes.");
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }

  return docs
    .map(document => {
      const fields = document.fields || {};
      const registration = firestoreDocumentFieldsToJs(fields);
      registration.registrationId = document.name.split("/").pop();
      registration.documentName = document.name;
      return registration;
    })
    .filter(registration => getRegistrationAsaasPaymentId(registration));
}

async function listPaidAsaasRegistrations(env) {
  return (await listAsaasRegistrations(env))
    .filter(registration => registration.paymentStatus === "pago");
}

async function listPendingAsaasRegistrations(env) {
  return (await listAsaasRegistrations(env))
    .filter(registration => (registration.paymentStatus || "pendente") === "pendente");
}

function isLocallyUnpaidRegistration(registration) {
  return String(registration.paymentStatus || "pendente") !== "pago";
}

function cleanupCandidateItem(registration, bank) {
  const paymentId = getRegistrationAsaasPaymentId(registration);
  const invoiceDeleted = bank.notFound === true;
  return {
    registrationId: registration.registrationId,
    paymentId,
    nome: registration.nome || "Atleta",
    amount: Number(registration.amount || 0),
    systemStatus: registration.paymentStatus || "pendente",
    asaasStatus: invoiceDeleted ? "DELETED_OR_MISSING" : (bank.rawStatus || ""),
    asaasStatusLabel: invoiceDeleted ? "Apagada/ausente" : normalizeInvoiceStatus(bank.rawStatus),
    invoiceUrl: bank.raw?.invoiceUrl || bank.raw?.bankSlipUrl || registration.invoiceUrl || "",
    invoiceExists: bank.ok,
    invoiceDeleted,
    canDeleteInvoice: bank.ok && isAsaasPendingStatus(bank.rawStatus)
  };
}

async function deleteFirestoreDocument(env, documentName) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${documentName}?key=${env.FIREBASE_API_KEY}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function cleanupPendingAsaasRegistrations(env, { apply = false, registrationIds = [] } = {}) {
  const onlyIds = new Set(registrationIds);
  const registrations = (await listAsaasRegistrations(env))
    .filter(isLocallyUnpaidRegistration)
    .filter(registration => onlyIds.size === 0 || onlyIds.has(registration.registrationId));
  const checked = [];
  const candidates = [];
  const ignored = [];
  const deleted = [];
  const errors = [];

  for (const registration of registrations) {
    const paymentId = getRegistrationAsaasPaymentId(registration);
    const bank = await getAsaasPayment(env, paymentId);
    const item = cleanupCandidateItem(registration, bank);
    checked.push(item);

    const isCandidate = bank.notFound || (bank.ok && isAsaasPendingStatus(bank.rawStatus));
    if (!isCandidate) {
      ignored.push(item);
      continue;
    }
    candidates.push(item);

    if (apply) {
      let invoiceDelete = { ok: true, skipped: true, reason: item.invoiceDeleted ? "invoice_already_missing" : "invoice_not_deletable" };
      if (item.canDeleteInvoice) invoiceDelete = await deleteAsaasInvoice(env, paymentId);
      if (!invoiceDelete.ok) {
        errors.push({ ...item, step: "asaas_invoice", error: invoiceDelete.error || "Falha ao apagar fatura no Asaas.", status: invoiceDelete.status });
        continue;
      }

      const registrationDelete = await deleteFirestoreDocument(env, registration.documentName);
      if (!registrationDelete.ok) {
        errors.push({ ...item, step: "registration", error: "Falha ao apagar inscricao no sistema.", status: registrationDelete.status });
        continue;
      }
      deleted.push({ ...item, invoiceDelete, registrationDelete });
    }
  }

  return {
    ok: true,
    apply,
    checked: checked.length,
    candidates,
    candidateCount: candidates.length,
    ignoredCount: ignored.length,
    deleted,
    deletedCount: deleted.length,
    errors,
    errorCount: errors.length,
    checkedAt: new Date().toISOString()
  };
}

async function reconcilePaidAsaasInvoices(env, { apply = false } = {}) {
  const paidRegistrations = await listPaidAsaasRegistrations(env);
  const checked = [];
  const conflicts = [];
  const alreadyAligned = [];
  const errors = [];
  const applied = [];

  for (const registration of paidRegistrations) {
    const paymentId = getRegistrationAsaasPaymentId(registration);
    const bank = await getAsaasPayment(env, paymentId);
    const item = {
      registrationId: registration.registrationId,
      paymentId,
      nome: registration.nome || "Atleta",
      amount: Number(registration.amount || 0),
      systemStatus: registration.paymentStatus,
      asaasStatus: bank.rawStatus || "",
      asaasStatusLabel: normalizeInvoiceStatus(bank.rawStatus),
      invoiceUrl: bank.raw?.invoiceUrl || bank.raw?.bankSlipUrl || registration.invoiceUrl || "",
      paidDate: paidDateForReceiveInCash(registration)
    };
    checked.push(item);

    if (!bank.ok) {
      errors.push({ ...item, error: bank.error, status: bank.status });
      continue;
    }
    if (isAsaasPaidStatus(bank.rawStatus)) {
      alreadyAligned.push(item);
      continue;
    }
    if (!isAsaasPendingStatus(bank.rawStatus)) {
      errors.push({ ...item, error: `Status Asaas nao corrigido automaticamente: ${bank.rawStatus || "sem status"}` });
      continue;
    }

    conflicts.push(item);
    if (apply) {
      const result = await receiveAsaasPaymentInCash(env, paymentId, registration);
      if (result.ok) applied.push({ ...item, resultStatus: result.raw?.status || "RECEIVED_IN_CASH" });
      else errors.push({ ...item, error: result.error, status: result.status });
    }
  }

  return {
    ok: true,
    apply,
    checked: checked.length,
    conflicts,
    conflictCount: conflicts.length,
    alreadyAlignedCount: alreadyAligned.length,
    applied,
    appliedCount: applied.length,
    errors,
    errorCount: errors.length,
    checkedAt: new Date().toISOString()
  };
}

function asaasSystemConflictItem(registration, bank) {
  const paymentId = getRegistrationAsaasPaymentId(registration);
  return {
    registrationId: registration.registrationId,
    paymentId,
    nome: registration.nome || "Atleta",
    amount: Number(registration.amount || 0),
    systemStatus: registration.paymentStatus || "pendente",
    asaasStatus: bank.rawStatus || "",
    asaasStatusLabel: normalizeInvoiceStatus(bank.rawStatus),
    invoiceUrl: bank.raw?.invoiceUrl || bank.raw?.bankSlipUrl || registration.invoiceUrl || "",
    euVouCardUrl: registration.euVouCardUrl || "",
    hasCard: Boolean(registration.euVouCardUrl)
  };
}

async function reconcileAsaasPaidSystemPending(env, { confirm = false, registrationIds = [] } = {}, ctx) {
  const onlyIds = new Set(registrationIds);
  const pendingRegistrations = (await listPendingAsaasRegistrations(env))
    .filter(registration => onlyIds.size === 0 || onlyIds.has(registration.registrationId));
  const checked = [];
  const conflicts = [];
  const alreadyAligned = [];
  const errors = [];
  const confirmed = [];

  for (const registration of pendingRegistrations) {
    const paymentId = getRegistrationAsaasPaymentId(registration);
    const bank = await getAsaasPayment(env, paymentId);
    const item = asaasSystemConflictItem(registration, bank);
    checked.push(item);

    if (!bank.ok) {
      errors.push({ ...item, error: bank.error, status: bank.status });
      continue;
    }
    if (!isAsaasPaidStatus(bank.rawStatus)) {
      alreadyAligned.push(item);
      continue;
    }

    conflicts.push(item);
    if (confirm) {
      const result = await confirmRegistrationPaymentById(env, registration.registrationId, ctx, { skipNotify: true, markGhost: true });
      if (result.found) confirmed.push({ ...item, confirmResult: result });
      else errors.push({ ...item, error: result.reason || result.error || "Inscricao nao encontrada." });
    }
  }

  return {
    ok: true,
    confirm,
    checked: checked.length,
    conflicts,
    conflictCount: conflicts.length,
    alreadyAlignedCount: alreadyAligned.length,
    confirmed,
    confirmedCount: confirmed.length,
    errors,
    errorCount: errors.length,
    checkedAt: new Date().toISOString()
  };
}

async function deleteCoraInvoice(env, invoiceId) {
  const accessToken = await getCoraAccessToken(env);
  const baseUrl = getCoraBaseUrl(env);
  const fetcher = getCoraFetcher(env);
  let res = await fetcher.fetch(`${baseUrl}/v2/invoices/${encodeURIComponent(invoiceId)}`, {
    method: "DELETE",
    headers: { "Accept": "application/json", "Authorization": `Bearer ${accessToken}` }
  });
  if (res.status === 404) {
    res = await fetcher.fetch(`${baseUrl}/v2/invoices/${encodeURIComponent(invoiceId)}/`, {
      method: "DELETE",
      headers: { "Accept": "application/json", "Authorization": `Bearer ${accessToken}` }
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.message || data.error_description || data.error || "Nao foi possivel excluir a fatura Cora." };
  return { ok: true, provider: "cora", id: invoiceId, deleted: true };
}

async function getAsaasBalance(env) {
  const [balanceResult, pendingCreditResult] = await Promise.allSettled([
    fetch(`${env.ASAAS_BASE_URL}/finance/balance`, {
      headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0" }
    }).then(async res => ({ res, data: await res.json().catch(() => ({})) })),
    getAsaasCreditCardPendingCredit(env)
  ]);

  if (balanceResult.status === "rejected") {
    return { ok: false, error: balanceResult.reason?.message || "Falha ao consultar Asaas." };
  }

  const { res, data } = balanceResult.value;
  if (!res.ok) return { ok: false, status: res.status, error: data.errors?.[0]?.description || data.message || data.error || "Falha ao consultar Asaas.", raw: data };
  const value = firstNumericValue(data, ["balance", "availableBalance", "available", "value"]);
  return {
    ok: true,
    status: res.status,
    balance: value,
    balanceCents: normalizeMoneyToCents(value),
    pendingCredit: pendingCreditResult.status === "fulfilled"
      ? pendingCreditResult.value
      : { ok: false, error: pendingCreditResult.reason?.message || "Falha ao consultar valores a creditar no Asaas.", count: 0, amountCents: 0, grossAmountCents: 0 },
    raw: data
  };
}

async function getAsaasCreditCardPendingCredit(env) {
  const items = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 100; page++) {
    const requestUrl = new URL(`${env.ASAAS_BASE_URL}/payments`);
    requestUrl.searchParams.set("limit", String(limit));
    requestUrl.searchParams.set("offset", String(offset));
    requestUrl.searchParams.set("status", "CONFIRMED");
    requestUrl.searchParams.set("billingType", "CREDIT_CARD");
    const res = await fetch(requestUrl.toString(), {
      headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0", "accept": "application/json" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data.errors?.[0]?.description || data.message || data.error || "Falha ao consultar cartões confirmados no Asaas.", count: 0, amountCents: 0, grossAmountCents: 0 };
    }
    const pageItems = collectListItems(data);
    items.push(...pageItems);
    if (!data.hasMore || pageItems.length === 0) break;
    offset += limit;
  }

  const confirmedCardItems = items.filter(item => (
    String(item.status || "").toUpperCase() === "CONFIRMED" &&
    String(item.billingType || "").toUpperCase() === "CREDIT_CARD"
  ));
  const amountCents = confirmedCardItems.reduce((sum, item) => {
    const value = Number(item.netValue ?? item.value ?? item.originalValue ?? 0);
    return sum + normalizeMoneyToCents(value);
  }, 0);
  const grossAmountCents = confirmedCardItems.reduce((sum, item) => {
    const value = Number(item.value ?? item.originalValue ?? item.netValue ?? 0);
    return sum + normalizeMoneyToCents(value);
  }, 0);

  return {
    ok: true,
    provider: "asaas",
    source: "asaas_payments",
    status: "CONFIRMED",
    billingType: "CREDIT_CARD",
    count: confirmedCardItems.length,
    amountCents,
    grossAmountCents,
    items: confirmedCardItems.map(item => ({
      id: String(item.id || ""),
      customer: cleanText(item.customerName || item.customer || item.description || ""),
      valueCents: normalizeMoneyToCents(Number(item.value ?? item.originalValue ?? item.netValue ?? 0)),
      netValueCents: normalizeMoneyToCents(Number(item.netValue ?? item.value ?? item.originalValue ?? 0)),
      status: String(item.status || ""),
      billingType: String(item.billingType || ""),
      estimatedCreditDate: item.estimatedCreditDate || item.creditDate || "",
      invoiceUrl: item.invoiceUrl || "",
    }))
  };
}

async function getCoraBalance(env) {
  const accessToken = await getCoraAccessToken(env);
  const baseUrl = getCoraBaseUrl(env);
  const fetcher = getCoraFetcher(env);
  const res = await fetcher.fetch(`${baseUrl}/third-party/account/balance`, {
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.message || data.error_description || data.error || "Falha ao consultar Cora.", raw: data };
  const value = firstNumericValue(data, ["balance", "available", "available_balance", "availableBalance", "amount", "value"]);
  const cents = Math.round(Number(value || 0));
  return { ok: true, status: res.status, balance: cents / 100, balanceCents: cents, raw: data };
}

function extractCoraInvoiceId(body, headers) {
  return String(
    headers?.get?.("webhook-resource-id") ||
    headers?.get?.("Webhook-Resource-Id") ||
    body?.webhook?.resource_id ||
    body?.invoice?.id ||
    body?.invoice?.code ||
    body?.data?.invoice?.id ||
    body?.data?.invoice?.code ||
    body?.payload?.invoice?.id ||
    body?.payload?.invoice?.code ||
    body?.resource?.id ||
    body?.resource?.code ||
    body?.resource_id ||
    body?.webhook_resource_id ||
    body?.data?.id ||
    body?.data?.code ||
    body?.id ||
    body?.code ||
    ""
  );
}

function extractCoraWebhookEventType(body, headers) {
  return String(
    headers?.get?.("webhook-event-type") ||
    headers?.get?.("Webhook-Event-Type") ||
    body?.webhook?.event_type ||
    body?.trigger ||
    body?.event ||
    body?.event_type ||
    body?.webhook_event_type ||
    body?.type ||
    body?.data?.event ||
    body?.data?.event_type ||
    body?.payload?.event ||
    body?.payload?.event_type ||
    ""
  );
}

function extractCoraPaymentStatus(body, headers) {
  const raw = String(
    extractCoraWebhookEventType(body, headers) ||
    body?.status ||
    body?.invoice?.status ||
    body?.data?.invoice?.status ||
    body?.data?.status ||
    body?.payload?.invoice?.status ||
    body?.payload?.status ||
    ""
  ).toLowerCase().replace(/_/g, ".");
  return ["paid", "payment.received", "payment.confirmed", "payment.paid", "pago", "paid.invoice", "invoice.paid", "invoice.payment.paid"].includes(raw) ? "paid" : raw;
}

async function testWebhookIntegration(env, provider, origin) {
  if (provider === "cora") {
    const checks = [
      {
        label: "Segredo do webhook",
        ok: Boolean(env.CORA_WEBHOOK_SECRET),
        detail: env.CORA_WEBHOOK_SECRET ? "Configurado no Worker." : "Configure CORA_WEBHOOK_SECRET no Worker."
      },
      {
        label: "URL do webhook",
        ok: true,
        detail: `${origin}/cora/webhook?token=${env.CORA_WEBHOOK_SECRET ? "CONFIGURADO" : "PENDENTE"}`
      }
    ];

    try {
      await getCoraAccessToken(env);
      checks.push({ label: "Credenciais Cora", ok: true, detail: "Autenticação Cora OK." });
    } catch (error) {
      checks.push({ label: "Credenciais Cora", ok: false, detail: error.message });
    }

    return {
      provider,
      success: checks.every(check => check.ok),
      webhookUrl: `${origin}/cora/webhook?token=${env.CORA_WEBHOOK_SECRET ? "CONFIGURADO" : "PENDENTE"}`,
      checks
    };
  }

  const checks = [
    {
      label: "Segredo do webhook",
      ok: Boolean(env.ASAAS_WEBHOOK_SECRET),
      detail: env.ASAAS_WEBHOOK_SECRET ? "Configurado no Worker." : "Configure ASAAS_WEBHOOK_SECRET no Worker."
    },
    {
      label: "URL do webhook",
      ok: true,
      detail: `${origin}/asaas/webhook`
    }
  ];

  try {
    const res = await fetch(`${env.ASAAS_BASE_URL}/finance/balance`, {
      headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0" }
    });
    checks.push({
      label: "Credenciais Asaas",
      ok: res.ok,
      detail: res.ok ? "Autenticação Asaas OK." : `Asaas respondeu HTTP ${res.status}.`
    });
  } catch (error) {
    checks.push({ label: "Credenciais Asaas", ok: false, detail: error.message });
  }

  return {
    provider,
    success: checks.every(check => check.ok),
    webhookUrl: `${origin}/asaas/webhook`,
    checks
  };
}

async function auditPendingPayments(env, options = {}) {
  const limit = options.limit || 150;
  const pending = await listPendingRegistrations(env, limit, { sinceIso: options.sinceIso });
  const results = [];

  for (const registration of pending) {
    const checksToRun = buildRegistrationPaymentChecks(registration);
    const checkedPayments = [];

    for (const paymentCheck of checksToRun) {
      const checked = await checkBankPaymentStatus(env, paymentCheck.provider, paymentCheck.paymentId);
      checkedPayments.push({
        ...paymentCheck,
        bankStatus: checked.status,
        bankPaid: checked.paid,
        bankOk: checked.ok,
        bankError: checked.error || "",
        rawStatus: checked.rawStatus || ""
      });
    }

    const selected = checkedPayments.find(item => item.bankPaid) || checkedPayments[0] || {
      provider: registration.paymentProvider === "cora" ? "cora" : "asaas",
      paymentId: "",
      paymentMethod: registration.paymentMethod || "",
      matchedPaymentField: "",
      bankStatus: "missing_payment_id",
      bankPaid: false,
      bankOk: false,
      bankError: "Sem ID de pagamento.",
      rawStatus: ""
    };

    results.push({
      ...registration,
      provider: selected.provider,
      paymentId: selected.paymentId,
      paymentMethod: selected.paymentMethod,
      matchedPaymentField: selected.matchedPaymentField,
      bankStatus: selected.bankStatus,
      bankPaid: selected.bankPaid,
      bankOk: selected.bankOk,
      bankError: selected.bankError,
      rawStatus: selected.rawStatus,
      checkedPayments
    });
  }

  const paidPending = results.filter(item => item.bankPaid);
  return {
    success: true,
    checkedAt: new Date().toISOString(),
    totalPending: pending.length,
    totalChecked: results.length,
    totalPaidPending: paidPending.length,
    paidPending,
    results
  };
}

// Rede de seguranca contra webhook perdido/atrasado ou o cliente trocar de forma de pagamento
// no meio do checkout (isso gera uma segunda fatura/cobranca que o webhook original nunca
// avisa sobre). Roda sozinha a cada poucos minutos (chamada pelo cron em `scheduled`) e
// confirma automaticamente qualquer inscricao pendente cujo pagamento ja apareça como pago no
// banco - sem depender de um admin abrir o painel e clicar em "verificar". So olha pendentes
// das ultimas `windowHours` horas: e onde um caso "preso" realmente importa, e mantem a
// varredura barata (nao reconsulta o banco pra inscricoes antigas e realmente abandonadas).
async function autoReconcilePendingPayments(env, ctx, options = {}) {
  const windowHours = options.windowHours || 6;
  const sinceIso = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  const startedAt = new Date().toISOString();
  let audit;
  try {
    audit = await auditPendingPayments(env, { limit: 300, sinceIso });
  } catch (error) {
    const logEntry = { startedAt, ok: false, error: error.message };
    if (env.NIGHTRUN_STORAGE) await env.NIGHTRUN_STORAGE.put("payments:auto-reconcile:last-run", JSON.stringify(logEntry), { expirationTtl: 7 * 86400 });
    console.error("[Auto Reconcile] Audit failed", error);
    return logEntry;
  }

  const fixed = [];
  const failed = [];
  for (const item of audit.paidPending) {
    try {
      // Confirma direto (nao via confirmRegistrationPaymentById) porque essa funcao sempre
      // marca manual:true - aqui a confirmacao veio de verificacao automatica contra o banco,
      // nao de um clique manual do admin, entao o rastro precisa refletir isso corretamente.
      const docUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_registrations/${encodeURIComponent(item.registrationId)}?key=${env.FIREBASE_API_KEY}`;
      const docRes = await fetch(docUrl);
      if (!docRes.ok) { failed.push({ registrationId: item.registrationId, reason: `fetch_${docRes.status}` }); continue; }
      const document = await docRes.json();
      const result = await confirmRegistrationDocument(env, document, ctx, { matchedPaymentField: item.matchedPaymentField, autoReconciled: true, markGhost: true });
      fixed.push({ registrationId: item.registrationId, nome: item.nome, provider: item.provider, paymentMethod: item.paymentMethod, notifyStatus: result.notifyResult?.status });
    } catch (error) {
      failed.push({ registrationId: item.registrationId, reason: error.message });
    }
  }

  const logEntry = {
    startedAt,
    finishedAt: new Date().toISOString(),
    ok: true,
    windowHours,
    totalChecked: audit.totalChecked,
    totalFixed: fixed.length,
    fixed,
    failed
  };
  if (env.NIGHTRUN_STORAGE) await env.NIGHTRUN_STORAGE.put("payments:auto-reconcile:last-run", JSON.stringify(logEntry), { expirationTtl: 7 * 86400 });
  if (fixed.length > 0) console.log("[Auto Reconcile] Fixed stuck payments", logEntry);
  return logEntry;
}

function buildRegistrationPaymentChecks(registration) {
  const checks = [];
  const seen = new Set();
  const add = (provider, paymentId, paymentMethod, matchedPaymentField) => {
    const id = String(paymentId || "").trim();
    if (!id) return;
    const key = `${provider}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    checks.push({ provider, paymentId: id, paymentMethod, matchedPaymentField });
  };

  add("asaas", registration.creditCardAsaasPaymentId, "credit_card", "creditCardAsaasPaymentId");

  if (registration.paymentProvider === "cora") {
    const coraPaymentId = registration.coraInvoiceId || registration.paymentExternalId || registration.coraInvoiceCode;
    const matchedPaymentField = registration.coraInvoiceId
      ? "coraInvoiceId"
      : registration.paymentExternalId
        ? "paymentExternalId"
        : "coraInvoiceCode";
    add("cora", coraPaymentId, "pix", matchedPaymentField);
  } else {
    add("asaas", registration.asaasPaymentId, registration.paymentMethod || "pix", "asaasPaymentId");
    if (registration.paymentMethod !== "credit_card") {
      add("asaas", registration.paymentExternalId, registration.paymentMethod || "pix", "paymentExternalId");
    }
  }

  return checks;
}

async function createCreditCardPaymentForRegistration(env, registrationId) {
  const methods = await getPaymentMethodsSettings(env);
  if (methods.cartao === false) {
    return { success: false, error: "Pagamento com cartão de crédito não está disponível no momento." };
  }

  const docUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_registrations/${encodeURIComponent(registrationId)}?key=${env.FIREBASE_API_KEY}`;
  const docRes = await fetch(docUrl);
  if (docRes.status === 404) return { success: false, error: "Inscrição não encontrada." };
  if (!docRes.ok) return { success: false, error: "Erro ao buscar inscrição." };

  const document = await docRes.json();
  const fields = document.fields || {};
  const existingPaymentId = firestoreString(fields.creditCardAsaasPaymentId);
  const existingInvoiceUrl = firestoreString(fields.creditCardInvoiceUrl);
  if (existingPaymentId && existingInvoiceUrl) {
    await markRegistrationAsAsaasCreditCard(env, document);
    return { success: true, paymentId: existingPaymentId, invoiceUrl: existingInvoiceUrl, reused: true };
  }

  const amount = firestoreNumber(fields.amount);
  if (!amount) return { success: false, error: "Valor da inscrição não encontrado." };

  let customerId = firestoreString(fields.asaasCustomerId);
  if (!customerId) {
    const customerRes = await fetch(`${env.ASAAS_BASE_URL}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0" },
      body: JSON.stringify({
        name: firestoreString(fields.nome),
        cpfCnpj: firestoreString(fields.cpf).replace(/\D/g, ""),
        email: firestoreString(fields.email),
        mobilePhone: firestoreString(fields.telefone).replace(/\D/g, "")
      })
    });
    const customer = await customerRes.json().catch(() => ({}));
    if (!customerRes.ok) {
      return { success: false, error: customer.errors?.[0]?.description || customer.message || "Falha ao criar cliente no Asaas." };
    }
    customerId = customer.id || "";
  }

  const paymentRes = await fetch(`${env.ASAAS_BASE_URL}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0" },
    body: JSON.stringify({
      customer: customerId,
      billingType: "CREDIT_CARD",
      value: amount / 100,
      dueDate: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
      description: "MCU Night Run 2026 - Cartão de crédito"
    })
  });
  const payment = await paymentRes.json().catch(() => ({}));
  if (!paymentRes.ok) {
    return { success: false, error: payment.errors?.[0]?.description || payment.message || "Falha ao criar cobrança de cartão." };
  }

  const paymentId = payment.id || "";
  const invoiceUrl = payment.invoiceUrl || "";
  const patchFields = {
    asaasCustomerId: { stringValue: customerId },
    asaasPaymentId: { stringValue: paymentId },
    paymentProvider: { stringValue: "asaas" },
    paymentExternalId: { stringValue: paymentId },
    paymentMethod: { stringValue: "credit_card" },
    invoiceUrl: { stringValue: invoiceUrl },
    creditCardAsaasPaymentId: { stringValue: paymentId },
    creditCardInvoiceUrl: { stringValue: invoiceUrl },
    creditCardPaymentStatus: { stringValue: payment.status || "PENDING" },
    updatedAt: { timestampValue: new Date().toISOString() }
  };
  const updateMask = Object.keys(patchFields).map(field => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  await fetch(`https://firestore.googleapis.com/v1/${document.name}?key=${env.FIREBASE_API_KEY}&${updateMask}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: patchFields })
  });

  return { success: true, paymentId, invoiceUrl, status: payment.status || "" };
}

async function listPendingRegistrations(env, limit, options = {}) {
  const searchUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`;
  // sinceIso restringe aos pendentes recentes (usa o indice composto paymentStatus+createdAt
  // ja existente) - a reconciliacao automatica roda a cada poucos minutos, entao nao faz
  // sentido nem e seguro (limite de API do banco) reconferir toda inscricao pendente desde
  // sempre a cada tick; so as recentes podem estar "presas" por um webhook perdido.
  const where = options.sinceIso
    ? {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "paymentStatus" }, op: "EQUAL", value: { stringValue: "pendente" } } },
            { fieldFilter: { field: { fieldPath: "createdAt" }, op: "GREATER_THAN_OR_EQUAL", value: { timestampValue: options.sinceIso } } }
          ]
        }
      }
    : { fieldFilter: { field: { fieldPath: "paymentStatus" }, op: "EQUAL", value: { stringValue: "pendente" } } };
  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: "nightrun_registrations" }],
      where,
      ...(options.sinceIso ? { orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }] } : {}),
      limit
    }
  };
  const res = await fetch(searchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(queryBody)
  });
  const rows = await res.json();
  if (!res.ok) throw new Error(rows?.error?.message || "Falha ao listar inscricoes pendentes.");
  return rows
    .map(row => row.document)
    .filter(Boolean)
    .map(document => {
      const fields = document.fields || {};
      return {
        registrationId: document.name.split("/").pop(),
        nome: firestoreString(fields.nome),
        telefone: firestoreString(fields.telefone),
        cpf: firestoreString(fields.cpf),
        email: firestoreString(fields.email),
        paymentProvider: firestoreString(fields.paymentProvider) || (firestoreString(fields.coraInvoiceId) ? "cora" : "asaas"),
        paymentStatus: firestoreString(fields.paymentStatus),
        amount: firestoreNumber(fields.amount),
        asaasPaymentId: firestoreString(fields.asaasPaymentId),
        creditCardAsaasPaymentId: firestoreString(fields.creditCardAsaasPaymentId),
        paymentMethod: firestoreString(fields.paymentMethod),
        coraInvoiceId: firestoreString(fields.coraInvoiceId),
        coraInvoiceCode: firestoreString(fields.coraInvoiceCode),
        paymentExternalId: firestoreString(fields.paymentExternalId),
        invoiceUrl: firestoreString(fields.invoiceUrl),
        createdAt: firestoreTimestamp(fields.createdAt)
      };
    });
}

function firestoreString(value) {
  return String(value?.stringValue || "");
}

function firestoreNumber(value) {
  return Number(value?.integerValue ?? value?.doubleValue ?? 0);
}

function firestoreTimestamp(value) {
  return value?.timestampValue || "";
}

async function patchFirestoreDocument(env, documentName, patchFields) {
  const updateMask = Object.keys(patchFields).map(field => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const res = await fetch(`https://firestore.googleapis.com/v1/${documentName}?key=${env.FIREBASE_API_KEY}&${updateMask}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: patchFields })
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function findRegistrationByPaymentId(env, paymentId, searchFields = ["asaasPaymentId"]) {
  const searchUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`;
  for (const fieldPath of searchFields) {
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: "nightrun_registrations" }],
        where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: paymentId } } },
        limit: 1
      }
    };
    const searchRes = await fetch(searchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queryBody)
    });
    const results = await searchRes.json().catch(() => []);
    const document = results[0]?.document || null;
    if (document) return { document, matchedField: fieldPath, status: searchRes.status };
  }
  return { document: null, matchedField: "", status: 404 };
}

async function markRegistrationAsAsaasCreditCard(env, document) {
  const fields = document.fields || {};
  const cardPaymentId = firestoreString(fields.creditCardAsaasPaymentId);
  if (!cardPaymentId) return { ok: true, skipped: true, reason: "missing_card_payment_id" };
  const cardInvoiceUrl = firestoreString(fields.creditCardInvoiceUrl);
  const customerId = firestoreString(fields.asaasCustomerId);
  const patchFields = {
    paymentProvider: { stringValue: "asaas" },
    paymentMethod: { stringValue: "credit_card" },
    paymentExternalId: { stringValue: cardPaymentId },
    asaasPaymentId: { stringValue: cardPaymentId },
    updatedAt: { timestampValue: new Date().toISOString() }
  };
  if (cardInvoiceUrl) patchFields.invoiceUrl = { stringValue: cardInvoiceUrl };
  if (customerId) patchFields.asaasCustomerId = { stringValue: customerId };
  return patchFirestoreDocument(env, document.name, patchFields);
}

async function fixCreditCardProviderRecords(env, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 500), 1), 1000);
  const dryRun = options.dryRun === true;
  const docs = [];
  let pageToken = "";
  while (docs.length < limit) {
    const pageSize = Math.min(300, limit - docs.length);
    const pageUrl = new URL(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_registrations`);
    pageUrl.searchParams.set("key", env.FIREBASE_API_KEY);
    pageUrl.searchParams.set("pageSize", String(pageSize));
    if (pageToken) pageUrl.searchParams.set("pageToken", pageToken);
    const res = await fetch(pageUrl.toString());
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: body.error?.message || "Falha ao listar inscricoes.", status: res.status };
    docs.push(...(body.documents || []));
    pageToken = body.nextPageToken || "";
    if (!pageToken) break;
  }
  const withCard = docs.filter(document => firestoreString(document.fields?.creditCardAsaasPaymentId));
  const targets = withCard.filter(document => {
    const fields = document.fields || {};
    return firestoreString(fields.paymentProvider) !== "asaas" ||
      firestoreString(fields.paymentMethod) !== "credit_card" ||
      firestoreString(fields.asaasPaymentId) !== firestoreString(fields.creditCardAsaasPaymentId);
  });
  const results = [];
  if (!dryRun) {
    for (const document of targets) {
      const fields = document.fields || {};
      const registrationId = document.name.split("/").pop();
      const patchResult = await markRegistrationAsAsaasCreditCard(env, document);
      results.push({
        registrationId,
        nome: firestoreString(fields.nome),
        previousProvider: firestoreString(fields.paymentProvider),
        creditCardAsaasPaymentId: firestoreString(fields.creditCardAsaasPaymentId),
        ok: patchResult.ok,
        status: patchResult.status
      });
    }
  }
  return {
    success: true,
    dryRun,
    scanned: docs.length,
    creditCardRecords: withCard.length,
    toFix: targets.length,
    fixed: dryRun ? 0 : results.filter(item => item.ok).length,
    results: dryRun
      ? targets.map(document => {
          const fields = document.fields || {};
          return {
            registrationId: document.name.split("/").pop(),
            nome: firestoreString(fields.nome),
            previousProvider: firestoreString(fields.paymentProvider),
            creditCardAsaasPaymentId: firestoreString(fields.creditCardAsaasPaymentId)
          };
        })
      : results
  };
}

async function checkBankPaymentStatus(env, provider, paymentId) {
  if (!paymentId) return { ok: false, paid: false, status: "missing_payment_id", error: "Sem ID de pagamento." };
  if (provider === "cora") return checkCoraInvoiceStatus(env, paymentId);
  return checkAsaasPaymentStatus(env, paymentId);
}

async function checkAsaasPaymentStatus(env, paymentId) {
  try {
    const res = await fetch(`${env.ASAAS_BASE_URL}/payments/${encodeURIComponent(paymentId)}`, {
      headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0" }
    });
    const data = await res.json().catch(() => ({}));
    const rawStatus = String(data.status || "").toUpperCase();
    const paid = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(rawStatus);
    return { ok: res.ok, paid, status: paid ? "paid" : rawStatus.toLowerCase() || `http_${res.status}`, rawStatus };
  } catch (error) {
    return { ok: false, paid: false, status: "error", error: error.message };
  }
}

async function checkCoraInvoiceStatus(env, invoiceId, options = {}) {
  try {
    const accessToken = await getCoraAccessToken(env);
    const baseUrl = getCoraBaseUrl(env);
    const fetcher = getCoraFetcher(env);
    const urls = [
      `${baseUrl}/v2/invoices/${encodeURIComponent(invoiceId)}`,
      `${baseUrl}/invoices/${encodeURIComponent(invoiceId)}`
    ];

    let last = null;
    for (const url of urls) {
      const res = await fetcher.fetch(url, {
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${accessToken}`
        }
      });
      const data = await res.json().catch(() => ({}));
      last = { res, data };
      if (res.ok) {
        const rawStatus = String(data.status || data.invoice?.status || data.data?.status || "").toLowerCase();
        const normalized = extractCoraPaymentStatus(data);
        return { ok: true, paid: normalized === "paid", status: normalized || rawStatus || "unknown", rawStatus };
      }
      // Token cacheado pode ter sido revogado antes do TTL vencer - descarta o cache e tenta
      // mais uma vez com um token novo, uma unica vez, antes de desistir.
      if (res.status === 401 && !options.retriedAfterTokenRefresh && env.NIGHTRUN_STORAGE) {
        await env.NIGHTRUN_STORAGE.delete("cora:access-token");
        return checkCoraInvoiceStatus(env, invoiceId, { retriedAfterTokenRefresh: true });
      }
      if (res.status !== 404) break;
    }

    return {
      ok: false,
      paid: false,
      status: last ? `http_${last.res.status}` : "not_checked",
      rawStatus: "",
      error: last?.data?.message || last?.data?.error || last?.data?.errors?.[0]?.message || "Falha ao consultar fatura Cora."
    };
  } catch (error) {
    return { ok: false, paid: false, status: "error", error: error.message };
  }
}

async function keepWhatsAppAlive(env, instanceName = getDefaultInstanceName(env)) {
  try {
    const stateResult = await getWhatsAppConnectionState(env, instanceName);
    const state = stateResult.state;
    if (state === "open") return { ok: true, state, checked: true };
    if (state === "connecting") return { ok: false, state, waitingForQrScan: true, checked: true };

    const connectRes = await fetch(`${env.EVOLUTION_URL}/instance/connect/${instanceName}`, {
      headers: { apikey: env.EVOLUTION_API_KEY }
    });
    let connectData = {};
    try { connectData = await connectRes.json(); } catch {}
    return { ok: connectRes.ok, state, reconnect: connectData, checked: true, instanceName };
  } catch (error) {
    console.error("[WhatsApp KeepAlive] Failed:", error);
    return { ok: false, error: error.message, instanceName };
  }
}

async function getWhatsAppConnectionState(env, instanceName = getDefaultInstanceName(env)) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${env.EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
      headers: { apikey: env.EVOLUTION_API_KEY },
      signal: controller.signal
    });
    let data = {};
    try { data = await res.json(); } catch {}
    const state = data?.instance?.state || data?.state || (res.ok ? "unknown" : "error");
    return { ok: res.ok, status: res.status, state, raw: data, instanceName };
  } finally {
    clearTimeout(timeout);
  }
}

async function confirmRegistrationPayment(env, paymentId, ctx, options = {}) {
  console.log("[Payment Confirm] Start", { paymentId, options });
  const searchFields = options.searchFields || ["asaasPaymentId"];
  const searchResult = await findRegistrationByPaymentId(env, paymentId, searchFields);
  const document = searchResult.document;

  console.log("[Payment Confirm] Firestore search", { paymentId, found: Boolean(document), status: searchResult.status, matchedField: searchResult.matchedField, searchFields });
  if (!document) return { found: false, reason: "registration_not_found" };

  return confirmRegistrationDocument(env, document, ctx, { ...options, matchedPaymentField: searchResult.matchedField });
}

async function confirmRegistrationPaymentById(env, registrationId, ctx, options = {}) {
  console.log("[Manual Payment Confirm] Start", { registrationId, options });
  const docUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_registrations/${encodeURIComponent(registrationId)}?key=${env.FIREBASE_API_KEY}`;
  const docRes = await fetch(docUrl);
  if (docRes.status === 404) return { found: false, reason: "registration_not_found" };
  if (!docRes.ok) {
    const errorText = await docRes.text().catch(() => "");
    return { found: false, reason: "firestore_error", status: docRes.status, error: errorText };
  }
  const document = await docRes.json();
  return confirmRegistrationDocument(env, document, ctx, { ...options, manual: true });
}

async function sendRegistrationPaymentCardById(env, registrationId, ctx, options = {}) {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_registrations/${encodeURIComponent(registrationId)}?key=${env.FIREBASE_API_KEY}`;
  const docRes = await fetch(docUrl);
  if (docRes.status === 404) return { found: false, reason: "registration_not_found" };
  if (!docRes.ok) {
    const errorText = await docRes.text().catch(() => "");
    return { found: false, reason: "firestore_error", status: docRes.status, error: errorText };
  }
  const document = await docRes.json();
  const fields = document.fields || {};
  if (fields.paymentStatus?.stringValue !== "pago") {
    return { found: true, success: false, reason: "registration_not_paid", error: "Confirme o pagamento antes de enviar o card." };
  }
  return sendPaymentConfirmationForDocument(env, document, ctx, { force: options.force === true });
}

async function sendPaymentConfirmationForDocument(env, document, ctx, options = {}) {
  const fields = document.fields || {};
  const phone = fields.telefone?.stringValue?.replace(/\D/g, "") || "";
  const nome = fields.nome?.stringValue || "Atleta";
  const modalidadeNome = fields.modalidadeNome?.stringValue || fields.modalidade?.stringValue || fields.categoria?.stringValue || "";
  const euVouCardUrl = fields.euVouCardUrl?.stringValue || "";
  const confirmationSentAt = firestoreTimestamp(fields.paymentConfirmationWhatsAppSentAt);
  const registrationId = document.name?.split("/").pop() || "";
  const notificationLockKey = `whatsapp:payment-confirmation:${registrationId}`;
  const notificationLocked = registrationId && env.NIGHTRUN_STORAGE
    ? await env.NIGHTRUN_STORAGE.get(notificationLockKey)
    : "";

  if (!phone) return { found: true, success: false, status: "skipped", reason: "missing_phone" };
  if (!euVouCardUrl) return { found: true, success: false, status: "skipped", reason: "missing_card" };
  if (!options.force && confirmationSentAt) return { found: true, success: true, status: "skipped", reason: "already_sent" };
  if (!options.force && notificationLocked) return { found: true, success: true, status: "queued_async", reason: "already_queued" };

  const whatsappConfig = await getPaymentConfirmationWhatsAppConfig(env);
  if (registrationId && env.NIGHTRUN_STORAGE) {
    await env.NIGHTRUN_STORAGE.put(notificationLockKey, "processing", { expirationTtl: 3600 });
  }

  const sendPromise = sendImmediateMessage({
    phone: formatPhoneForWhatsApp(phone),
    text: buildPaymentConfirmationText(nome, modalidadeNome),
    imageUrl: euVouCardUrl,
    instanceName: whatsappConfig.instanceName,
    adminPhone: whatsappConfig.adminPhone,
    alunoNome: nome,
    registrationId,
    registrationDocumentName: document.name,
    type: "payment_confirmation"
  }, env)
  .then(async res => {
    console.log("[Payment Confirm] WhatsApp async result", { registrationId, res });
    if (res.success) await markPaymentConfirmationSent(env, document.name, registrationId, res.instanceName || whatsappConfig.instanceName);
    return { found: true, success: res.success, notifyResult: res, status: res.success ? "sent" : "failed" };
  })
  .catch(err => {
    console.error("[Payment Confirm] WhatsApp async error", { registrationId, err });
    return { found: true, success: false, error: err.message };
  });

  if (ctx && typeof ctx.waitUntil === "function" && !options.force) {
    ctx.waitUntil(sendPromise);
    return { found: true, success: true, status: "queued_async" };
  }

  return sendPromise;
}

async function confirmRegistrationDocument(env, document, ctx, options = {}) {
  const fields = document.fields || {};
  const alreadyPaid = fields.paymentStatus?.stringValue === "pago";
  const phone = fields.telefone?.stringValue?.replace(/\D/g, "") || "";
  const nome = fields.nome?.stringValue || "Atleta";
  const euVouCardUrl = fields.euVouCardUrl?.stringValue || "";
  const confirmationSentAt = firestoreTimestamp(fields.paymentConfirmationWhatsAppSentAt);
  const registrationId = document.name?.split("/").pop() || "";
  console.log("[Payment Confirm] Registration data", { registrationId, alreadyPaid, hasPhone: Boolean(phone), nome, hasCard: Boolean(euVouCardUrl), confirmationSentAt, euVouCardUrl });

  if (options.matchedPaymentField === "creditCardAsaasPaymentId") {
    await markRegistrationAsAsaasCreditCard(env, document).catch(error => {
      console.error("[Payment Confirm] Failed to mark credit card provider", { registrationId, error: error.message });
    });
  }

  if (!alreadyPaid) {
    const maskFields = ["paymentStatus"];
    const patchFields = { paymentStatus: { stringValue: "pago" } };
    if (options.manual) {
      maskFields.push("updatedAt", "manualPaymentConfirmedAt");
      const now = new Date().toISOString();
      patchFields.updatedAt = { timestampValue: now };
      patchFields.manualPaymentConfirmedAt = { timestampValue: now };
    }
    if (options.markGhost) {
      maskFields.push("pendenciaFantasma", "pendenciaFantasmaDetectadaEm");
      patchFields.pendenciaFantasma = { booleanValue: true };
      patchFields.pendenciaFantasmaDetectadaEm = { timestampValue: new Date().toISOString() };
    }
    const updateMask = maskFields.map(f => `updateMask.fieldPaths=${f}`).join("&");
    const patchRes = await fetch(`https://firestore.googleapis.com/v1/${document.name}?key=${env.FIREBASE_API_KEY}&${updateMask}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: patchFields })
    });
    console.log("[Payment Confirm] Firestore patch", { registrationId, status: patchRes.status, ok: patchRes.ok });

    // Conta atomicamente essa confirmacao pro limite de 1000 - dispara o aviso automatico
    // (WhatsApp + PDF pros numeros configurados) na hora exata em que o contador cruza 1000.
    // Cobre pagamentos reais (webhook) e confirmacao manual do admin, que passam por aqui;
    // o cron de 1 em 1 minuto recalibra o contador contra a contagem real do Firestore como
    // rede de seguranca pra qualquer caminho que confirme pagamento sem passar por essa funcao.
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(bumpConfirmedCounterAndMaybeBroadcast(env, ctx));
    } else {
      await bumpConfirmedCounterAndMaybeBroadcast(env, ctx);
    }
  }

  let notifyResult = null;
  if (!options.skipNotify) {
    console.log("[Payment Confirm] Sending WhatsApp (Async)", { registrationId, forceNotify: Boolean(options.forceNotify), hasCard: Boolean(euVouCardUrl) });
    notifyResult = await sendPaymentConfirmationForDocument(env, document, ctx, { force: false });
  } else {
    const reason = "skip_notify";
    notifyResult = { status: "skipped", reason };
    console.log("[Payment Confirm] WhatsApp skipped", { registrationId, reason, hasPhone: Boolean(phone), hasCard: Boolean(euVouCardUrl), confirmationSentAt });
  }

  return { found: true, alreadyPaid, forcedNotify: Boolean(options.forceNotify), notifyResult };
}

async function markPaymentConfirmationSent(env, documentName, registrationId, instanceName) {
  const now = new Date().toISOString();
  const result = await patchFirestoreDocument(env, documentName, {
    paymentConfirmationWhatsAppSentAt: { timestampValue: now },
    paymentConfirmationWhatsAppInstance: { stringValue: instanceName || "" }
  });
  if (registrationId && env.NIGHTRUN_STORAGE) {
    await env.NIGHTRUN_STORAGE.put(`whatsapp:payment-confirmation:${registrationId}`, "sent", { expirationTtl: 604800 });
  }
  return result;
}

async function queueMessage(msg, env) {
  const key = `mq:pending:${Date.now()}:${crypto.randomUUID().substring(0, 8)}`;
  await env.NIGHTRUN_STORAGE.put(key, JSON.stringify({ ...msg, enqueuedAt: new Date().toISOString() }));
  await markQueueHasPending(env);
}

// Sinalizador leve (1 KV key) que substitui um list() a cada tick do cron para descobrir se
// a fila tem algo - list() tem cota MUITO mais apertada (1000/dia, igual escrita) do que get()
// (100k/dia). So list() de verdade quando esse flag diz que ha algo, o que é raro comparado
// aos 1440 ticks/dia do cron.
async function markQueueHasPending(env) {
  if (!env.NIGHTRUN_STORAGE) return;
  await env.NIGHTRUN_STORAGE.put("mq:has-pending", "1");
}

async function sendImmediateMessage(msg, env, options = {}) {
  console.log("[WhatsApp Immediate] Start", { phone: msg.phone, hasImage: Boolean(msg.imageUrl), textLength: msg.text?.length || 0, options });
  const result = await sendMessageWithFallback(msg, env);
  console.log("[WhatsApp Immediate] Result", { phone: msg.phone, result });
  if (!options.skipLog) {
    await logToFirestore(msg, result, env).catch(error => console.error("[WhatsApp Log] Failed:", error));
  }
  if (!result.success && !options.skipKvFallback) {
    await queueMessage({
      ...msg,
      immediateFailedAt: new Date().toISOString(),
      lastError: result.response || result.status
    }, env).catch(error => console.error("[WhatsApp Queue] Failed to enqueue fallback:", error));
  }
  return result;
}

async function sendMessageWithFallback(msg, env) {
  console.log("[WhatsApp Fallback] First attempt", { phone: msg.phone, hasImage: Boolean(msg.imageUrl), imageUrl: msg.imageUrl });
  const first = await sendMessage(msg, env);
  console.log("[WhatsApp Fallback] First result", { phone: msg.phone, first });
  if (first.success || !msg.imageUrl) return first;

  let attempts = [first];
  if (typeof msg.imageUrl === "string" && msg.imageUrl.startsWith("http")) {
    try {
      console.log("[WhatsApp Fallback] Trying base64 image", { phone: msg.phone, imageUrl: msg.imageUrl });
      const converted = await getBase64FromUrl(msg.imageUrl);
      const second = await sendMessage({
        ...msg,
        imageUrl: `data:${converted.mimeType};base64,${converted.base64}`
      }, env);
      attempts.push(second);
      console.log("[WhatsApp Fallback] Base64 result", { phone: msg.phone, second });
      if (second.success) return { ...second, fallback: "base64_image", attempts };
    } catch (error) {
      console.error("[WhatsApp Fallback] Base64 failed", error);
      attempts.push({ success: false, status: "ERRO", response: { message: error.message }, fallback: "base64_image" });
    }
  }

  if (msg.type === "payment_confirmation") {
    return { ...first, success: false, fallback: "image_required", attempts };
  }

  console.log("[WhatsApp Fallback] Trying text only", { phone: msg.phone });
  const textOnly = await sendMessage({ ...msg, imageUrl: "" }, env);
  attempts.push(textOnly);
  console.log("[WhatsApp Fallback] Text only result", { phone: msg.phone, textOnly });
  return { ...textOnly, fallback: "text_only", attempts };
}

// Drena a fila de forma 100% server-side (disparada pelo cron `* * * * *`), sem depender do front.
// Cada execução ("tick") tem um orcamento de tempo (budget) menor que o intervalo do cron e menor
// que o TTL do lock, entao dois ticks nunca se sobrepoem (evita envio duplicado). O espacamento de
// 30s entre mensagens vem do carimbo `whatsapp:last-send:<instancia>` no KV, que persiste entre ticks:
// se a proxima mensagem ainda nao venceu os 30s, o tick para e deixa o restante para o proximo cron.
async function processQueue(env) {
  const isPaused = await env.NIGHTRUN_STORAGE.get("mq:paused") === "true";
  if (isPaused) return { processed: 0, skipped: "paused" };

  // Espia a fila via um flag leve (get, cota de 100k/dia) ANTES de fazer list() de verdade
  // (cota bem mais apertada, 1000/dia) ou travar o lock (escrita, mesma cota apertada). O cron
  // roda a cada minuto (1440x/dia) e a grande maioria dos ticks encontra a fila vazia - sem
  // esse flag, tanto o list() quanto a escrita do lock estourariam a cota diária sozinhos.
  const hasPending = await env.NIGHTRUN_STORAGE.get("mq:has-pending");
  if (hasPending !== "1") return { processed: 0, skipped: "empty" };

  const lock = await env.NIGHTRUN_STORAGE.get("mq:processing");
  if (lock === "true") return { processed: 0, skipped: "already_processing" };

  // Orcamento do tick menor que o intervalo do cron (60s). O lock e sempre liberado no finally;
  // o TTL e apenas uma trava de seguranca caso a execucao morra no meio. O KV exige TTL >= 60s.
  const budgetMs = Math.max(5000, Number(env.WHATSAPP_QUEUE_TICK_BUDGET_MS || 45000));
  const lockTtl = Math.max(60, Math.ceil(budgetMs / 1000) + 15);
  const delayMs = Math.max(0, Number(env.WHATSAPP_INSTANCE_DELAY_MS || 30000));
  const limit = Number(env.WHATSAPP_QUEUE_LIMIT || 60);

  await env.NIGHTRUN_STORAGE.put("mq:processing", "true", { expirationTtl: lockTtl });
  const tickStart = Date.now();
  try {
    const list = await env.NIGHTRUN_STORAGE.list({ prefix: "mq:pending:", limit });
    if (list.keys.length === 0) {
      await env.NIGHTRUN_STORAGE.delete("mq:has-pending");
      return { processed: 0 };
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;

    // FIFO: as chaves incluem o timestamp de enfileiramento no nome, entao ja vem ordenadas.
    for (const key of list.keys) {
      if (Date.now() - tickStart >= budgetMs) break;

      const data = await env.NIGHTRUN_STORAGE.get(key.name);
      if (!data) continue;
      const msg = JSON.parse(data);
      if (msg.type === "registration_notice") msg.imageUrl = "";

      // Quanto falta para esta instancia poder enviar de novo (respeitando os 30s).
      const instanceName = msg.instanceName || "";
      let waitMs = 0;
      if (instanceName) {
        const last = Number(await env.NIGHTRUN_STORAGE.get(`whatsapp:last-send:${instanceName}`) || 0);
        waitMs = Math.max(0, last + delayMs - Date.now());
      }
      // Se esperar estoura o orcamento do tick, para aqui e deixa para o proximo cron.
      if ((Date.now() - tickStart) + waitMs > budgetMs) break;
      if (waitMs > 0) await sleep(waitMs);

      // sendMessage aplica o throttle interno por instancia (agora ~0, pois ja aguardamos) e
      // atualiza o carimbo last-send apos enviar.
      const result = await sendMessageWithFallback(msg, env);
      await logToFirestore(msg, result, env);
      processed++;

      if (result.success) {
        sent++;
        if (msg.type === "payment_confirmation" && msg.registrationDocumentName) {
          await markPaymentConfirmationSent(env, msg.registrationDocumentName, msg.registrationId, result.instanceName || msg.instanceName);
        }
        await env.NIGHTRUN_STORAGE.delete(key.name);
      } else {
        failed++;
        await markQueueFailure(key.name, msg, result, env);
      }
    }

    const remaining = await env.NIGHTRUN_STORAGE.list({ prefix: "mq:pending:", limit: 1 });
    if (remaining.keys.length === 0) await env.NIGHTRUN_STORAGE.delete("mq:has-pending");
    return { processed, sent, failed, remainingHint: remaining.keys.length > 0 };
  } finally {
    await env.NIGHTRUN_STORAGE.delete("mq:processing");
  }
}

async function sendMessage(msg, env) {
  const normalizedPhone = formatPhoneForWhatsApp(msg.phone);
  const selectedInstance = await chooseWhatsAppInstance(env, msg.instanceName || "");
  const instanceName = selectedInstance.instanceName;
  console.log("[WhatsApp Send] Start", { phone: msg.phone, normalizedPhone, hasImage: Boolean(msg.imageUrl), hasDocument: Boolean(msg.documentBase64), instanceName, instanceSource: selectedInstance.source });
  const keepAliveResult = await keepWhatsAppAlive(env, instanceName);
  console.log("[WhatsApp Send] KeepAlive result", keepAliveResult);
  if (keepAliveResult.state !== "open") {
    return {
      success: false,
      status: "ERRO",
      httpStatus: 409,
      normalizedError: "whatsapp_not_connected",
      response: {
        message: "WhatsApp nao esta conectado. Escaneie o QR Code e aguarde o status Conectado.",
        connection: keepAliveResult
      }
    };
  }
  // skipThrottle: usado quando duas mensagens do MESMO disparo (ex: banner + PDF do aviso
  // de 1000 confirmados) precisam sair em sequencia pro mesmo numero sem o espacamento
  // padrao entre envios - esse throttle existe pra disparos em massa pra numeros diferentes.
  const throttle = msg.skipThrottle ? { waitedMs: 0 } : await throttleWhatsAppInstance(env, instanceName);
  if (throttle.waitedMs > 0) {
    console.log("[WhatsApp Send] Instance throttle", { instanceName, waitedMs: throttle.waitedMs });
  }
  const isDocument = !!msg.documentBase64;
  const isMedia = !isDocument && !!msg.imageUrl;
  const endpoint = (isMedia || isDocument) ? `/message/sendMedia/${instanceName}` : `/message/sendText/${instanceName}`;
  const payload = { number: normalizedPhone };

  if (isDocument) {
    payload.mediatype = "document";
    payload.mediaType = "document";
    payload.mimetype = msg.documentMimeType || "application/pdf";
    payload.fileName = msg.documentFileName || "documento.pdf";
    payload.caption = msg.text;
    payload.media = msg.documentBase64;
  } else if (isMedia) {
    let media = msg.imageUrl, mime = "image/png";
    if (msg.imageUrl.startsWith("data:")) {
      const match = msg.imageUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mime = match[1];
        media = match[2];
      }
    }
    payload.mediatype = "image";
    payload.mediaType = "image";
    payload.mimetype = mime;
    payload.fileName = "imagem.png";
    payload.caption = msg.text;
    payload.media = media;
  } else {
    payload.text = msg.text;
    payload.linkPreview = false;
  }

  const res = await fetch(`${env.EVOLUTION_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.EVOLUTION_API_KEY },
    body: JSON.stringify(payload)
  });

  const rawText = await res.text();
  let jsonRes = {};
  try { jsonRes = rawText ? JSON.parse(rawText) : {}; } catch { jsonRes = { raw: rawText }; }
  const normalizedError =
    jsonRes?.response?.message ||
    jsonRes?.message ||
    jsonRes?.error ||
    jsonRes?.raw ||
    "";
  console.log("[WhatsApp Send] Evolution response", {
    phone: msg.phone,
    normalizedPhone,
    instanceName,
    endpoint,
    httpStatus: res.status,
    ok: res.ok,
    normalizedError,
    response: jsonRes
  });
  return { success: res.ok, status: res.ok ? "SUCESSO" : "ERRO", httpStatus: res.status, normalizedError, instanceName, response: jsonRes };
}

// ==================== 1000 CONFIRMADOS: contador, PDF, banner, disparo ====================

const THOUSAND_COUNTER_DOC = "nightrun_settings/confirmed_counter";
const THOUSAND_BROADCAST_DOC = "nightrun_settings/thousand_broadcast";
const THOUSAND_THRESHOLD = 1000;

async function getFirestoreDocSafe(env, docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// Incrementa um campo numerico atomicamente via fieldTransforms.increment (operacao nativa
// do Firestore, sem race condition mesmo com varias confirmacoes de pagamento chegando quase
// juntas) e devolve o valor resultante direto da resposta do commit.
async function firestoreIncrementField(env, docPath, fieldPath, delta) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:commit?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      writes: [{
        transform: {
          document: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}`,
          fieldTransforms: [{ fieldPath, increment: { integerValue: String(delta) } }]
        }
      }]
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Falha ao incrementar ${docPath}.${fieldPath}: ${res.status} ${text}`);
  }
  const data = await res.json();
  const transformResult = data?.writeResults?.[0]?.transformResults?.[0];
  return Number(transformResult?.integerValue ?? transformResult?.doubleValue ?? 0);
}

async function bumpConfirmedCounterAndMaybeBroadcast(env, ctx) {
  try {
    const newCount = await firestoreIncrementField(env, THOUSAND_COUNTER_DOC, "count", 1);
    console.log("[Thousand] Counter incremented", { newCount });
    if (newCount >= THOUSAND_THRESHOLD) {
      await maybeTriggerThousandBroadcast(env, ctx, newCount);
    }
  } catch (error) {
    console.error("[Thousand] Failed to increment counter", error);
  }
}

// Roda no cron a cada minuto: recalibra o contador contra a contagem real do Firestore.
// Rede de seguranca pra qualquer caminho que confirme pagamento sem passar pelo incremento
// acima (ex: inscricao gratuita por cupom 100%, feita direto pelo formulario publico) e
// autocorrige qualquer drift (ex: cancelamento de uma inscricao ja confirmada).
async function recalibrateConfirmedCounter(env, ctx) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runAggregationQuery?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery: {
          from: [{ collectionId: "nightrun_registrations" }],
          where: { fieldFilter: { field: { fieldPath: "paymentStatus" }, op: "EQUAL", value: { stringValue: "pago" } } }
        },
        aggregations: [{ alias: "total", count: {} }]
      }
    })
  });
  if (!res.ok) return;
  const data = await res.json();
  const trueCount = Number(data?.[0]?.result?.aggregateFields?.total?.integerValue || 0);

  const counterDoc = await getFirestoreDocSafe(env, THOUSAND_COUNTER_DOC);
  const storedCount = Number(counterDoc?.fields?.count?.integerValue || 0);

  if (trueCount !== storedCount) {
    console.log("[Thousand] Recalibrating counter", { storedCount, trueCount });
    await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${THOUSAND_COUNTER_DOC}?key=${env.FIREBASE_API_KEY}&updateMask.fieldPaths=count`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { count: { integerValue: String(trueCount) } } })
    });
  }

  if (trueCount >= THOUSAND_THRESHOLD) {
    await maybeTriggerThousandBroadcast(env, ctx, trueCount);
  }
}

// Lock via KV garante que so um disparo real aconteca, mesmo se o incremento (na hora da
// confirmacao) e a recalibracao do cron detectarem a virada pra 1000 quase ao mesmo tempo.
async function maybeTriggerThousandBroadcast(env, ctx, count) {
  const lockKey = "thousand:broadcast:lock";
  if (env.NIGHTRUN_STORAGE) {
    const existing = await env.NIGHTRUN_STORAGE.get(lockKey);
    if (existing) return;
    await env.NIGHTRUN_STORAGE.put(lockKey, "sent", { expirationTtl: 30 * 86400 });
  }

  const broadcastDoc = await getFirestoreDocSafe(env, THOUSAND_BROADCAST_DOC);
  if (broadcastDoc?.fields?.sent?.booleanValue === true) return;

  console.log("[Thousand] Threshold reached, triggering real broadcast", { count });
  await triggerThousandBroadcast(env, ctx, { test: false, count }).catch(error => {
    console.error("[Thousand] Broadcast failed", error);
  });
}

async function fetchConfirmedRosterForBroadcast(env) {
  const [regsRes, modsRes, kitsRes] = await Promise.all([
    fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "nightrun_registrations" }],
          where: { fieldFilter: { field: { fieldPath: "paymentStatus" }, op: "EQUAL", value: { stringValue: "pago" } } }
        }
      })
    }),
    fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_modalidades?key=${env.FIREBASE_API_KEY}`),
    fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_kits?key=${env.FIREBASE_API_KEY}`)
  ]);
  const regsData = await regsRes.json().catch(() => []);
  const modsData = await modsRes.json().catch(() => ({}));
  const kitsData = await kitsRes.json().catch(() => ({}));

  const modalidadeNomeById = {};
  (modsData.documents || []).forEach(d => {
    modalidadeNomeById[d.name.split("/").pop()] = d.fields?.nome?.stringValue || "";
  });
  const kitNomeById = {};
  (kitsData.documents || []).forEach(d => {
    kitNomeById[d.name.split("/").pop()] = d.fields?.nome?.stringValue || "";
  });

  return (Array.isArray(regsData) ? regsData : [])
    .filter(r => r.document)
    .map(r => {
      const f = r.document.fields || {};
      const modalidadeId = f.modalidadeId?.stringValue || "";
      const kitId = f.kit?.stringValue || "unico";
      return {
        nome: f.nome?.stringValue || "Sem nome",
        modalidade: modalidadeNomeById[modalidadeId] || f.modalidadeNome?.stringValue || (f.categoria?.stringValue === "infantil" ? "Infantil" : "-"),
        kit: kitNomeById[kitId] || "Kit Único",
        telefone: f.telefone?.stringValue || "",
        fotoUrl: f.fotoUrl?.stringValue || ""
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// Converte bytes pra base64 em pedacos (mais rapido e evita estourar limites de call stack
// / string em buffers grandes, ao contrario de um loop char-a-char ingenuo ou spread direto).
function bytesToBase64Chunked(bytes) {
  const CHUNK = 8192;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// Baixa a foto original (sem redimensionar via resvg - instanciar o resvg-wasm ~1000x so
// pra reduzir o tamanho de cada foto e CPU-bound demais e estoura o orcamento de execucao do
// Worker, mesmo em segundo plano via waitUntil). Embutimos o arquivo original direto na
// pagina, com um limite de tamanho por foto pra manter cada pagina do PDF leve o bastante -
// quem faz o "resize" visual e o proprio resvg na hora de rasterizar a pagina inteira, usando
// width/height pequenos no <image>.
const MAX_SOURCE_PHOTO_BYTES = 140_000;

// As fotos ficam no bucket R2 (env.MEDIA_BUCKET), servidas publicamente via /media/<key>.
// Um Worker NAO consegue fazer fetch() confiavel na sua PROPRIA URL publica (mesma limitacao
// documentada no proxy do Hub acima: a Cloudflare as vezes devolve 404/1042 pra requisicoes
// que voltam pro mesmo Worker) - por isso le direto do bucket pela binding em vez de HTTP.
function extractMediaKeyFromUrl(url) {
  const marker = "/media/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
}

async function fetchRosterPhotoRaw(env, url) {
  if (!url) return null;
  try {
    const key = extractMediaKeyFromUrl(url);
    let buf, contentType;
    if (key) {
      const obj = await env.MEDIA_BUCKET.get(key);
      if (!obj) return null;
      buf = await obj.arrayBuffer();
      contentType = obj.httpMetadata?.contentType || "image/jpeg";
    } else {
      // Foto hospedada fora do nosso bucket (nao deveria acontecer com os dados atuais,
      // mas mantem um fallback via fetch normal pra qualquer URL externa).
      const res = await fetch(url);
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      contentType = res.headers.get("content-type") || "image/jpeg";
      buf = await res.arrayBuffer();
    }
    if (buf.byteLength > MAX_SOURCE_PHOTO_BYTES) return null;
    return { base64: bytesToBase64Chunked(new Uint8Array(buf)), contentType };
  } catch (error) {
    console.warn("[Thousand] Falha ao baixar foto", { url, error: error.message });
    return null;
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// PDF com o mesmo estilo visual do PDF de kits (header.png, titulo em Montserrat bold navy,
// tabela com linhas zebradas navy/branco) - so que com foto, modalidade, kit e telefone, pra
// todos os confirmados, em ordem alfabetica. Cada pagina e desenhada como SVG (mesma tecnica
// ja usada pro banner do resumo operacional) e renderizada pra PNG via resvg; as paginas PNG
// viram um PDF unico via pdf-lib (worker nao tem DOM, entao nao da pra usar jsPDF+canvas como
// no admin).
async function generateConfirmedRosterPdf(env, roster, { test = false } = {}) {
  await ensureResvgWasm();

  const W = 992, H = 1403; // A4 a ~120dpi
  const marginX = 48;

  // Usa /header-pdf.png (versao ja reduzida pro tamanho real usado aqui, ~170KB) em vez do
  // header.png original (~1.5MB) - o resvg-wasm nao aguenta bem strings/base64 gigantes
  // passadas pra dentro do WASM (RangeError "Invalid array buffer length"), entao evitamos
  // redimensionar a imagem grande dentro do worker e usamos uma ja pequena de origem.
  const headerRes = await fetch("https://night-run-uba.web.app/header-pdf.png");
  const headerBase64 = bytesToBase64Chunked(new Uint8Array(await headerRes.arrayBuffer()));

  // Sem fotos aqui de proposito: decodificar ~1000 JPEGs (mesmo sem redimensionar antes)
  // estoura o limite de CPU por execucao do Worker (erro 1102), mesmo rodando em segundo
  // plano - o gargalo e o decode das imagens dentro do resvg na hora de renderizar cada
  // pagina, nao tem como evitar sem tirar as fotos. O banner (so ~50 fotos) continua com
  // mosaico normal. Pra lista completa COM foto por atleta, usar a Planilha Gerador do
  // admin (roda no navegador do usuario, sem limite de CPU de servidor).
  const headerH = W / (2172 / 724);
  const rowH = 30;
  const usableW = W - marginX * 2;
  const colNome = marginX;
  const colModalidade = colNome + 330;
  const colKit = colModalidade + 190;
  const colTelefone = colKit + 160;
  const tableHeaderY = headerH + 45;
  const tableHeaderH = 26;
  const rowsStartY = tableHeaderY + tableHeaderH + 8;
  const rowsPerPage = Math.max(1, Math.floor((H - rowsStartY - 26) / rowH));
  const pageCount = Math.max(1, Math.ceil(roster.length / rowsPerPage));

  const NAVY = "#071A45";
  const STRIPE = "#f1f5f9";

  const pagesPng = [];
  for (let page = 0; page < pageCount; page++) {
    const start = page * rowsPerPage;
    const items = roster.slice(start, start + rowsPerPage);
    let rowsSvg = "";
    let defsSvg = "";

    items.forEach((item, i) => {
      const idx = start + i;
      const rowY = rowsStartY + i * rowH;
      const stripe = idx % 2 === 1 ? `<rect x="${marginX}" y="${rowY}" width="${usableW}" height="${rowH}" fill="${STRIPE}"/>` : "";
      const cy = rowY + rowH / 2;
      rowsSvg += `${stripe}
        <text x="${colNome}" y="${cy + 5}" font-size="13" font-family="Montserrat" font-weight="800" fill="${NAVY}">${xmlEscape(item.nome.toUpperCase())}</text>
        <text x="${colModalidade}" y="${cy + 5}" font-size="12" font-family="Montserrat" fill="${NAVY}">${xmlEscape(item.modalidade)}</text>
        <text x="${colKit}" y="${cy + 5}" font-size="12" font-family="Montserrat" fill="${NAVY}">${xmlEscape(item.kit)}</text>
        <text x="${colTelefone}" y="${cy + 5}" font-size="12" font-family="Montserrat" fill="${NAVY}">${xmlEscape(item.telefone)}</text>`;
    });

    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>${defsSvg}</defs>
      <rect width="${W}" height="${H}" fill="#ffffff"/>
      <image x="0" y="0" width="${W}" height="${headerH}" href="data:image/png;base64,${headerBase64}" preserveAspectRatio="xMidYMid slice"/>
      <text x="${marginX}" y="${headerH + 30}" font-size="22" font-family="Montserrat" font-weight="800" fill="${NAVY}">${test ? "[TESTE] " : ""}1000 CONFIRMADOS — MCU NIGHT RUN 2026</text>
      <rect x="${marginX}" y="${tableHeaderY}" width="${usableW}" height="${tableHeaderH}" fill="${NAVY}"/>
      <text x="${colNome}" y="${tableHeaderY + 18}" font-size="11" font-family="Montserrat" font-weight="800" fill="#ffffff">NOME</text>
      <text x="${colModalidade}" y="${tableHeaderY + 18}" font-size="11" font-family="Montserrat" font-weight="800" fill="#ffffff">MODALIDADE</text>
      <text x="${colKit}" y="${tableHeaderY + 18}" font-size="11" font-family="Montserrat" font-weight="800" fill="#ffffff">KIT</text>
      <text x="${colTelefone}" y="${tableHeaderY + 18}" font-size="11" font-family="Montserrat" font-weight="800" fill="#ffffff">TELEFONE</text>
      ${rowsSvg}
      <text x="${W - marginX}" y="${H - 14}" font-size="10" font-family="Montserrat" fill="#94a3b8" text-anchor="end">Página ${page + 1} de ${pageCount} · ${roster.length} confirmados</text>
    </svg>`;

    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: W },
      font: { fontBuffers: [new Uint8Array(MONTSERRAT_TTF)], loadSystemFonts: false, defaultFontFamily: "Montserrat" }
    });
    const rendered = resvg.render();
    pagesPng.push(rendered.asPng());
    rendered.free();
    resvg.free();
  }

  const pdfDoc = await PDFDocument.create();
  for (const png of pagesPng) {
    const img = await pdfDoc.embedPng(png);
    const pdfPage = pdfDoc.addPage([W, H]);
    pdfPage.drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  return pdfDoc.save();
}

// Banner horizontal festivo (mosaico com fotos reais dos atletas confirmados + "PARABENS!
// 1000 CONFIRMADOS") pro header da mensagem de WhatsApp do aviso. Mesma tecnica de
// renderizacao do banner operacional, com uma amostra espalhada do roster real ao fundo -
// bem mais empolgante que so gradiente e confete generico.
async function generateThousandCelebrationBannerPng(env, roster = []) {
  await ensureResvgWasm();
  const logoBase64 = await getOperationalLogoBase64(env);
  const W = 1200, H = 675;

  // Amostra ~50 fotos espalhadas pela lista inteira (nao so as primeiras em ordem alfabetica),
  // pra formar um mosaico representativo. Mesma concorrencia baixa + limite de tamanho + free()
  // ja validados na geracao do PDF, senao arrisca o mesmo vazamento de memoria do WASM.
  const COLS = 10, ROWS = 5;
  const sampleSize = COLS * ROWS;
  const step = Math.max(1, Math.floor(roster.length / sampleSize));
  const sample = roster.filter((_, i) => i % step === 0).slice(0, sampleSize);
  const thumbs = await mapWithConcurrency(sample, 20, item => fetchRosterPhotoRaw(env, item.fotoUrl));

  const tileW = W / COLS, tileH = H / ROWS;
  const mosaic = thumbs.map((photo, i) => {
    if (!photo) return "";
    const col = i % COLS, row = Math.floor(i / COLS);
    return `<image x="${col * tileW}" y="${row * tileH}" width="${tileW + 1}" height="${tileH + 1}" href="data:${photo.contentType};base64,${photo.base64}" preserveAspectRatio="xMidYMid slice"/>`;
  }).join("");

  const GOLD = "#FFD700";
  const stars = Array.from({ length: 18 }, (_, i) => {
    const x = Math.round((i * 173 + 40) % W);
    const y = Math.round((i * 97 + 30) % H);
    const s = 10 + (i % 3) * 6;
    const rot = (i * 37) % 360;
    const colors = [GOLD, "#6BFF2A", "#ffffff"];
    return `<g transform="translate(${x} ${y}) rotate(${rot})" opacity="${0.55 + (i % 3) * 0.15}">
      <path d="M0 -${s} L${s * 0.28} -${s * 0.28} L${s} 0 L${s * 0.28} ${s * 0.28} L0 ${s} L-${s * 0.28} ${s * 0.28} L-${s} 0 L-${s * 0.28} -${s * 0.28} Z" fill="${colors[i % colors.length]}"/>
    </g>`;
  }).join("");

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="dark" cx="50%" cy="50%" r="75%">
        <stop offset="0%" stop-color="#071A45" stop-opacity="0.94"/>
        <stop offset="55%" stop-color="#071A45" stop-opacity="0.88"/>
        <stop offset="100%" stop-color="#071A45" stop-opacity="0.55"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#071A45"/>
    ${mosaic}
    <rect width="${W}" height="${H}" fill="url(#dark)"/>
    ${stars}
    <image x="${W / 2 - 130}" y="34" width="260" height="153" href="data:image/png;base64,${logoBase64}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${W / 2}" y="270" font-size="26" fill="${GOLD}" text-anchor="middle" font-family="Montserrat" font-weight="800" letter-spacing="4">MISSÃO CUMPRIDA</text>
    <text x="${W / 2}" y="360" font-size="86" fill="#ffffff" text-anchor="middle" font-family="Montserrat" font-weight="800">PARABÉNS!</text>
    <text x="${W / 2}" y="450" font-size="58" fill="#6BFF2A" text-anchor="middle" font-family="Montserrat" font-weight="800" letter-spacing="1">1000 CONFIRMADOS</text>
    <text x="${W / 2}" y="520" font-size="24" fill="#ffffff" text-anchor="middle" font-family="Montserrat" font-weight="800" letter-spacing="1" opacity="0.9">A MAIOR CORRIDA NOTURNA DA REGIÃO ESTÁ COMPLETA!</text>
    <text x="${W / 2}" y="600" font-size="20" fill="${GOLD}" text-anchor="middle" font-family="Montserrat" font-weight="800" letter-spacing="3">MCU NIGHT RUN 2026</text>
  </svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: { fontBuffers: [new Uint8Array(MONTSERRAT_TTF)], loadSystemFonts: false, defaultFontFamily: "Montserrat" }
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  rendered.free();
  resvg.free();
  return png;
}

function pngBytesToBase64(pngBytes) {
  return bytesToBase64Chunked(pngBytes instanceof Uint8Array ? pngBytes : new Uint8Array(pngBytes));
}

// Orquestra o disparo completo: gera banner + PDF, busca os numeros configurados em
// nightrun_settings/thousand_broadcast e manda 2 mensagens pra cada um (banner com legenda,
// depois o PDF). No modo teste, nao mexe no contador nem no flag "sent" - so envia.
async function triggerThousandBroadcast(env, ctx, { test = false, count = null, dryRun = false } = {}) {
  const broadcastDoc = await getFirestoreDocSafe(env, THOUSAND_BROADCAST_DOC);
  const numbers = (broadcastDoc?.fields?.numbers?.arrayValue?.values || []).map(v => v.stringValue).filter(Boolean);

  if (!dryRun && numbers.length === 0) {
    console.warn("[Thousand] Nenhum numero configurado para o aviso.");
    return { success: false, reason: "no_numbers_configured" };
  }

  const roster = await fetchConfirmedRosterForBroadcast(env);
  // As fotos vem do R2 (binding), nao de fetch() - sem limite de conexoes simultaneas pra
  // se preocupar aqui, entao gera banner e PDF em paralelo pra reduzir o tempo total.
  const [bannerPng, pdfBytes] = await Promise.all([
    generateThousandCelebrationBannerPng(env, roster),
    generateConfirmedRosterPdf(env, roster, { test })
  ]);

  // Modo dry: so verifica se a geracao do banner e do PDF funciona (util pra depurar sem
  // precisar de um numero real configurado, ja que isso manda mensagem de verdade).
  if (dryRun) {
    return { success: true, dryRun: true, rosterCount: roster.length, bannerBytes: bannerPng.byteLength, pdfBytes: pdfBytes.byteLength };
  }

  const bannerBase64 = pngBytesToBase64(bannerPng);
  const pdfBase64 = pngBytesToBase64(pdfBytes);

  const testPrefix = test ? "[TESTE] " : "";
  const caption = `${testPrefix}🎉🔥 MISSÃO CUMPRIDA! 🔥🎉\n\n` +
    `Acabamos de bater os *1000 CONFIRMADOS* na MCU Night Run 2026! 🏃‍♂️💨🏃‍♀️\n\n` +
    `Isso é história sendo feita — a MAIOR corrida noturna da região tá com a lista de heróis completa! 🙌🏆\n\n` +
    `📎 Já vem chegando a lista oficial com todo mundo que topou esse desafio.\n\n` +
    `Bora comemorar! 🎊✨`;

  const pdfCaption = `${testPrefix}📋 LISTA OFICIAL DOS 1000 CONFIRMADOS\n\n` +
    `${roster.length} atletas, foto, modalidade, kit e telefone — em ordem alfabética. 🏅\n\n` +
    `MCU Night Run 2026 🌙⚡`;

  // Manda o banner e o PDF em sequencia pro mesmo numero, sem esperar o throttle padrao entre
  // eles (esse delay existe pra disparos em massa pra numeros diferentes, nao faz sentido
  // dentro do mesmo aviso) - assim os dois chegam praticamente juntos.
  const results = [];
  for (const phone of numbers) {
    const bannerResult = await sendMessage({ phone, text: caption, imageUrl: `data:image/png;base64,${bannerBase64}`, skipThrottle: true }, env).catch(error => ({ success: false, error: error.message }));
    const pdfResult = await sendMessage({
      phone,
      text: pdfCaption,
      documentBase64: pdfBase64,
      documentMimeType: "application/pdf",
      documentFileName: `${test ? "teste-" : ""}1000-confirmados-mcu-night-run.pdf`,
      skipThrottle: true
    }, env).catch(error => ({ success: false, error: error.message }));
    results.push({ phone, bannerResult, pdfResult });
  }

  if (!test) {
    await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${THOUSAND_BROADCAST_DOC}?key=${env.FIREBASE_API_KEY}&updateMask.fieldPaths=sent&updateMask.fieldPaths=sentAt&updateMask.fieldPaths=count`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          sent: { booleanValue: true },
          sentAt: { timestampValue: new Date().toISOString() },
          count: { integerValue: String(count || roster.length) }
        }
      })
    });
  }

  return { success: true, test, rosterCount: roster.length, results };
}

async function throttleWhatsAppInstance(env, instanceName) {
  const delayMs = Math.max(0, Number(env.WHATSAPP_INSTANCE_DELAY_MS || 30000));
  if (!delayMs || !env.NIGHTRUN_STORAGE) return { waitedMs: 0 };

  const key = `whatsapp:last-send:${instanceName}`;
  const now = Date.now();
  const last = Number(await env.NIGHTRUN_STORAGE.get(key) || 0);
  const waitMs = Math.max(0, last + delayMs - now);
  if (waitMs > 0) await sleep(waitMs);
  await env.NIGHTRUN_STORAGE.put(key, String(Date.now()), { expirationTtl: 3600 });
  return { waitedMs: waitMs };
}

async function markQueueFailure(key, msg, result, env) {
  const attempts = Number(msg.attempts || 0) + 1;
  const maxAttempts = msg.type === "payment_confirmation"
    ? Number(env.WHATSAPP_CONFIRMATION_MAX_ATTEMPTS || 20)
    : Number(env.WHATSAPP_QUEUE_MAX_ATTEMPTS || 3);
  if (attempts >= maxAttempts) {
    await env.NIGHTRUN_STORAGE.delete(key);
    if (msg.type === "payment_confirmation" && msg.registrationId) {
      await env.NIGHTRUN_STORAGE.delete(`whatsapp:payment-confirmation:${msg.registrationId}`);
    }
    return;
  }

  await env.NIGHTRUN_STORAGE.put(key, JSON.stringify({
    ...msg,
    attempts,
    lastError: result.response || result.status,
    lastAttemptAt: new Date().toISOString()
  }));
}

function sleep(ms) {
  return ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve();
}

// ==================== RESUMO OPERACIONAL DIARIO ====================
const BR_OFFSET_MS = 3 * 3600 * 1000; // Brasil = UTC-3

async function getFirestoreDoc(env, collection, id) {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_API_KEY) return null;
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${id}?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const fields = data.fields || {};
  const out = {};
  for (const key in fields) out[key] = firestoreValueToJs(fields[key]);
  return out;
}

function formatBRL(cents) {
  const value = Number(cents || 0) / 100;
  const [intPart, decPart] = value.toFixed(2).split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${withThousands},${decPart}`;
}

// Componentes de calendario BR e o intervalo UTC do "dia anterior" (00:00-23:59 BR).
function brDayContext(nowUtcMs) {
  const br = new Date(nowUtcMs - BR_OFFSET_MS);
  const Y = br.getUTCFullYear(), M = br.getUTCMonth(), D = br.getUTCDate();
  const hh = String(br.getUTCHours()).padStart(2, "0");
  const mm = String(br.getUTCMinutes()).padStart(2, "0");
  const todayStr = `${Y}-${String(M + 1).padStart(2, "0")}-${String(D).padStart(2, "0")}`;
  const startUtc = Date.UTC(Y, M, D - 1) + BR_OFFSET_MS; // dia anterior 00:00 BR em UTC
  const endUtc = Date.UTC(Y, M, D) + BR_OFFSET_MS;       // hoje 00:00 BR em UTC
  const yesterday = new Date(Date.UTC(Y, M, D - 1));
  const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterday.getUTCDate()).padStart(2, "0")}`;
  const yesterdayLabel = `${String(yesterday.getUTCDate()).padStart(2, "0")}/${String(yesterday.getUTCMonth() + 1).padStart(2, "0")}/${yesterday.getUTCFullYear()}`;
  const yesterdayShort = `${String(yesterday.getUTCDate()).padStart(2, "0")}/${String(yesterday.getUTCMonth() + 1).padStart(2, "0")}`;
  return { nowHM: `${hh}:${mm}`, todayStr, yesterdayStr, startIso: new Date(startUtc).toISOString(), endIso: new Date(endUtc).toISOString(), yesterdayLabel, yesterdayShort };
}

// Intervalo UTC (00:00-23:59 BR) de uma data especifica (envio manual, hoje ou passado).
function brRangeForDate(dateStr) {
  const [Y, M, D] = String(dateStr).split("-").map(Number);
  const startUtc = Date.UTC(Y, M - 1, D) + BR_OFFSET_MS;
  const endUtc = Date.UTC(Y, M - 1, D + 1) + BR_OFFSET_MS;
  const label = `${String(D).padStart(2, "0")}/${String(M).padStart(2, "0")}/${Y}`;
  const shortLabel = `${String(D).padStart(2, "0")}/${String(M).padStart(2, "0")}`;
  return { dateStr, startIso: new Date(startUtc).toISOString(), endIso: new Date(endUtc).toISOString(), label, shortLabel };
}

async function computeDailySummary(env, startIso, endIso) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: "nightrun_registrations" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "createdAt" }, op: "GREATER_THAN_OR_EQUAL", value: { timestampValue: startIso } } },
            { fieldFilter: { field: { fieldPath: "createdAt" }, op: "LESS_THAN", value: { timestampValue: endIso } } },
          ],
        },
      },
      limit: 5000,
    },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const rows = await res.json().catch(() => []);
  let feitas = 0, confirmadasDoDia = 0, arrecadado = 0;
  const cupons = {};
  const semCupom = { count: 0, valorCents: 0 };
  const confirmadosNomes = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const f = row.document?.fields;
    if (!f) continue;
    feitas++;
    const pago = firestoreString(f.paymentStatus) === "pago";
    if (pago) {
      confirmadasDoDia++;
      const amount = firestoreNumber(f.amount);
      arrecadado += amount;
      const nome = firestoreString(f.nome).trim().toUpperCase();
      if (nome) {
        const iso = firestoreTimestamp(f.createdAt);
        let hora = "";
        if (iso) {
          const local = new Date(new Date(iso).getTime() - BR_OFFSET_MS);
          hora = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
        }
        confirmadosNomes.push({ nome, hora });
      }
      // Cupons e "sem cupom" contam apenas inscricoes confirmadas.
      const code = firestoreString(f.couponCode).toUpperCase();
      const usouCupom = (f.descontoCupom?.booleanValue === true || Boolean(code)) && Boolean(code);
      if (usouCupom) {
        const info = cupons[code] || { count: 0, valorCents: 0 };
        info.count += 1;
        info.valorCents += amount;
        cupons[code] = info;
      } else {
        semCupom.count += 1;
        semCupom.valorCents += amount;
      }
    }
  }
  confirmadosNomes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { feitas, confirmadasDoDia, arrecadado, cupons, semCupom, confirmadosNomes };
}

// Conta confirmadas no total; se cutoffIso for informado, conta apenas as criadas ate aquele
// instante (usado para relatorios de datas passadas, sem incluir inscricoes futuras aquela data).
async function countConfirmedRegistrations(env, cutoffIso) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runAggregationQuery?key=${env.FIREBASE_API_KEY}`;
  const filters = [{ fieldFilter: { field: { fieldPath: "paymentStatus" }, op: "EQUAL", value: { stringValue: "pago" } } }];
  if (cutoffIso) filters.push({ fieldFilter: { field: { fieldPath: "createdAt" }, op: "LESS_THAN", value: { timestampValue: cutoffIso } } });
  const body = {
    structuredAggregationQuery: {
      aggregations: [{ alias: "total", count: {} }],
      structuredQuery: {
        from: [{ collectionId: "nightrun_registrations" }],
        where: filters.length > 1 ? { compositeFilter: { op: "AND", filters } } : filters[0],
      },
    },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const rows = await res.json().catch(() => []);
  const agg = rows?.[0]?.result?.aggregateFields?.total;
  return Number(agg?.integerValue ?? agg?.doubleValue ?? 0);
}

function buildOperationalSummaryText(summary, totalConfirmadas, yesterdayLabel, nowUtcMs, balances = {}) {
  const DIV = "━━━━━━━━━━━━━━━";
  const cuponsEntries = Object.entries(summary.cupons).sort((a, b) => (b[1].count || 0) - (a[1].count || 0));
  const cuponsLinhas = cuponsEntries.length
    ? cuponsEntries.map(([code, info]) => `• ${code}: *${info.count}*  —  ${formatBRL(info.valorCents)}`).join("\n")
    : "• Nenhum cupom usado no dia.";
  const geradoEm = new Date(nowUtcMs - BR_OFFSET_MS);
  const geradoStr = `${String(geradoEm.getUTCDate()).padStart(2, "0")}/${String(geradoEm.getUTCMonth() + 1).padStart(2, "0")}/${geradoEm.getUTCFullYear()} ${String(geradoEm.getUTCHours()).padStart(2, "0")}:${String(geradoEm.getUTCMinutes()).padStart(2, "0")}`;
  const nomes = Array.isArray(summary.confirmadosNomes) ? summary.confirmadosNomes : [];
  const nomesLinhas = nomes.length
    ? nomes.map((item, i) => {
        const nome = typeof item === "string" ? item : item.nome;
        const hora = typeof item === "string" ? "" : item.hora;
        return `${String(i + 1).padStart(2, "0")}. ${nome}${hora ? ` (${hora})` : ""}`;
      }).join("\n")
    : "• Nenhum confirmado no dia.";
  const balanceItem = (label, balance) => (!balance || balance.ok === false)
    ? `• ${label}: indisponivel`
    : `• ${label}: *${formatBRL(balance.balanceCents)}*`;
  const semCupom = summary.semCupom || { count: 0, valorCents: 0 };
  const saldoHeader = balances.asOf ? `*SALDO EM CAIXA* _(${balances.asOf})_` : "*SALDO EM CAIXA*";

  return [
    "*RESUMO OPERACIONAL*",
    "MCU NIGHT RUN 2026",
    `_${yesterdayLabel}_`,
    DIV,
    "*MOVIMENTO DO DIA*",
    `• Inscricoes feitas: *${summary.confirmadasDoDia}*`,
    `• Arrecadado no dia: *${formatBRL(summary.arrecadado)}*`,
    DIV,
    "*CUPONS USADOS*",
    cuponsLinhas,
    "",
    "*SEM CUPOM*",
    `• ${semCupom.count} inscricoes  —  ${formatBRL(semCupom.valorCents)}`,
    DIV,
    saldoHeader,
    balanceItem("Cora", balances.cora),
    balanceItem("Asaas", balances.asaas),
    DIV,
    `*TOTAL CONFIRMADAS (geral):* *${totalConfirmadas}*`,
    DIV,
    `*CONFIRMADOS DO DIA (${nomes.length})*`,
    nomesLinhas,
    DIV,
    `_Gerado em ${geradoStr}_`,
  ].join("\n");
}

async function getBankBalances(env) {
  const [asaasResult, coraResult] = await Promise.allSettled([getAsaasBalance(env), getCoraBalance(env)]);
  return {
    asaas: asaasResult.status === "fulfilled" ? asaasResult.value : { ok: false },
    cora: coraResult.status === "fulfilled" ? coraResult.value : { ok: false },
  };
}

// Guarda o saldo do fim do dia (chamado as 23:59 BR) para o resumo do dia seguinte.
async function snapshotDailyBalances(env, dateStr) {
  const b = await getBankBalances(env);
  const payload = {
    coraCents: b.cora?.ok ? b.cora.balanceCents : 0,
    coraOk: Boolean(b.cora?.ok),
    asaasCents: b.asaas?.ok ? b.asaas.balanceCents : 0,
    asaasOk: Boolean(b.asaas?.ok),
    at: new Date().toISOString(),
  };
  if (env.NIGHTRUN_STORAGE) {
    await env.NIGHTRUN_STORAGE.put(`balance:snapshot:${dateStr}`, JSON.stringify(payload), { expirationTtl: 60 * 86400 });
  }
  return payload;
}

async function maybeSnapshotBalances(env) {
  const ctx = brDayContext(Date.now());
  if (ctx.nowHM !== "23:59") return { skipped: "not_time" };
  if (!env.NIGHTRUN_STORAGE) return { skipped: "no_kv" };
  const lockKey = `balance:snap:lock:${ctx.todayStr}`;
  if (await env.NIGHTRUN_STORAGE.get(lockKey)) return { skipped: "locked" };
  await env.NIGHTRUN_STORAGE.put(lockKey, "1", { expirationTtl: 7200 });
  return { snapshot: await snapshotDailyBalances(env, ctx.todayStr) };
}

// Saldo do relatorio: usa o snapshot de 23:59 daquele dia (dateStr). Se a data for hoje e ainda
// nao houver snapshot, usa o saldo ao vivo. Se for uma data passada sem snapshot, marca indisponivel
// (mostrar o saldo atual seria enganoso para uma data que ja passou).
async function resolveReportBalances(env, dateStr, shortLabel, todayStr) {
  if (env.NIGHTRUN_STORAGE) {
    const raw = await env.NIGHTRUN_STORAGE.get(`balance:snapshot:${dateStr}`);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        return {
          cora: { ok: s.coraOk !== false, balanceCents: s.coraCents },
          asaas: { ok: s.asaasOk !== false, balanceCents: s.asaasCents },
          asOf: `23:59 de ${shortLabel}`,
        };
      } catch (e) { /* cai para as regras abaixo */ }
    }
  }
  if (dateStr === todayStr) {
    const live = await getBankBalances(env);
    return { ...live, asOf: "agora" };
  }
  return { cora: { ok: false }, asaas: { ok: false }, asOf: `sem registro de ${shortLabel}` };
}

// Monta os dados (resumo + saldos + banner) para uma data BR especifica, sem enviar.
async function buildOperationalReport(env, range, todayStr) {
  const [summary, totalConfirmadas, balances] = await Promise.all([
    computeDailySummary(env, range.startIso, range.endIso),
    countConfirmedRegistrations(env, range.endIso),
    resolveReportBalances(env, range.dateStr, range.shortLabel, todayStr),
  ]);
  const text = buildOperationalSummaryText(summary, totalConfirmadas, range.label, Date.now(), balances);
  return { summary, totalConfirmadas, balances, text };
}

// Monta e envia o resumo de uma data BR especifica: UMA UNICA mensagem (imagem com a data + legenda completa).
async function sendOperationalReport(env, cfg, range, todayStr) {
  const report = await buildOperationalReport(env, range, todayStr);
  const phoneFmt = formatPhoneForWhatsApp(String(cfg.phone || ""));
  const instanceName = String(cfg.instanceName || "");

  let imageUrl;
  try {
    const png = await generateOperationalBannerPng(env, range.shortLabel);
    imageUrl = pngToDataUri(png);
  } catch (error) {
    console.error("[OpSummary] banner generation failed", error);
  }

  const msg = { phone: phoneFmt, text: report.text, imageUrl, instanceName, type: "operational_summary", alunoNome: "Resumo Operacional" };
  const result = await sendMessage(msg, env).catch(err => ({ success: false, status: "ERRO", error: err.message, response: { message: err.message } }));
  await logToFirestore(msg, result.success ? result : { ...result, status: "ERRO" }, env).catch(() => {});

  return { sent: Boolean(result.success), ...report, dateLabel: range.label, error: result.success ? undefined : (result.normalizedError || result.error) };
}

// Envio automatico do dia anterior (agendado pelo cron). force=true ignora horario/lastSent (teste).
async function runOperationalSummary(env, options = {}) {
  const cfg = await getFirestoreDoc(env, "nightrun_settings", "operational_summary");
  if (!cfg) return { skipped: "no_config" };
  const phone = String(cfg.phone || "");
  if (!options.force) {
    if (cfg.enabled !== true) return { skipped: "disabled" };
    if (!String(cfg.time || "") || !phone) return { skipped: "incomplete" };
  }
  if (!phone) return { skipped: "no_phone" };

  const ctx = brDayContext(Date.now());
  if (!options.force) {
    if (ctx.nowHM !== String(cfg.time)) return { skipped: "not_time", nowHM: ctx.nowHM, target: cfg.time };
    if (String(cfg.lastSentDate || "") === ctx.todayStr) return { skipped: "already_sent_today" };
    // Trava anti-duplicidade no minuto (o cron roda a cada minuto).
    if (env.NIGHTRUN_STORAGE) {
      const lockKey = `opsummary:lock:${ctx.todayStr}`;
      if (await env.NIGHTRUN_STORAGE.get(lockKey)) return { skipped: "locked" };
      await env.NIGHTRUN_STORAGE.put(lockKey, "1", { expirationTtl: 7200 });
    }
  }

  const range = brRangeForDate(ctx.yesterdayStr);
  const result = await sendOperationalReport(env, cfg, range, ctx.todayStr);

  if (!options.force) {
    await patchFirestoreDocument(env, `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/nightrun_settings/operational_summary`, {
      lastSentDate: { stringValue: ctx.todayStr },
      lastSentAt: { timestampValue: new Date().toISOString() },
      lastSentOk: { booleanValue: Boolean(result.sent) },
    }).catch(() => {});
  }

  return { ...result, yesterdayLabel: range.label, preview: result.text };
}

// Envio manual para uma data escolhida (hoje ou passada). Nao mexe na trava do envio automatico.
async function runManualOperationalSummary(env, dateStr) {
  const cfg = await getFirestoreDoc(env, "nightrun_settings", "operational_summary");
  if (!cfg) return { skipped: "no_config" };
  if (!String(cfg.phone || "")) return { skipped: "no_phone" };
  const ctx = brDayContext(Date.now());
  const range = brRangeForDate(dateStr);
  const result = await sendOperationalReport(env, cfg, range, ctx.todayStr);
  return { ...result, preview: result.text };
}

async function getBase64FromUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Download failed");
  const buf = await r.arrayBuffer();
  const ct = r.headers.get("content-type") || "image/png";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return { base64: btoa(bin), mimeType: ct };
}

async function logToFirestore(msg, result, env) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/whatsapp_logs?key=${env.FIREBASE_API_KEY}`;
  const fields = {
    destinatario: { stringValue: msg.phone },
    mensagem: { stringValue: (msg.text || "").substring(0, 500) },
    status: { stringValue: result.status },
    dataHora: { stringValue: new Date().toISOString() },
    tipo: { stringValue: msg.imageUrl ? "MEDIA" : "TEXTO" },
    source: { stringValue: "nightrun" }
  };
  if (msg.alunoNome) fields.alunoNome = { stringValue: msg.alunoNome };
  if (result.instanceName || msg.instanceName) fields.instanceName = { stringValue: result.instanceName || msg.instanceName };
  if (!result.success) fields.erro = { stringValue: JSON.stringify(result.response).substring(0, 500) };
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
}
