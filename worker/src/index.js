/**
 * Cloudflare Worker: MCU Night Run API
 * Proxy para Asaas, Evolution API, R2 Storage e Fila de Mensagens
 */

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
          const status = extractCoraPaymentStatus(body, request.headers);
          console.log("[Cora Webhook] Received", { eventType, resourceId, invoiceId, status, hasBody: Boolean(bodyText) });
          if (invoiceId && status === "paid") {
            const result = await confirmRegistrationPayment(env, invoiceId, ctx, {
              searchFields: ["coraInvoiceId", "coraInvoiceCode", "paymentExternalId"]
            });
            console.log("[Cora Webhook] Confirmation result", { invoiceId, result });
          }
          return json({ received: true, invoiceId, status });
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
          const result = await confirmRegistrationPaymentById(env, registrationId, ctx, { forceNotify: true });
          results.push({ registrationId, ...result });
        }
        return json({ success: true, count: results.length, results });
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

      const manualConfirmMatch = path.match(/^\/registrations\/([^/]+)\/confirm-payment$/);
      if (manualConfirmMatch && request.method === "POST") {
        const registrationId = decodeURIComponent(manualConfirmMatch[1]);
        const result = await confirmRegistrationPaymentById(env, registrationId, ctx, { forceNotify: true });
        if (!result.found) return json(result, 404);
        return json(result, 200);
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
          return json({ paid: true, alreadyPaid: true, status: "paid" });
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
        const list = await env.NIGHTRUN_STORAGE.list({ prefix: "mq:pending:" });
        for (const key of list.keys) await env.NIGHTRUN_STORAGE.delete(key.name);
        return json({ success: true });
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

      // ==================== DOCS ====================
      if (cleanPath === "/docs" || cleanPath === "/") {
        return new Response(`<html><head><title>MCU Night Run API</title></head><body style="font-family:system-ui;background:#1B2150;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#D4E926;font-size:2.5rem">MCU Night Run API</h1><p>Worker ativo ✓</p><p style="opacity:.5;margin-top:20px">Endpoints: /asaas/*, /media/*, /queue/*, /whatsapp/*</p></div></body></html>`, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders }
        });
      }

      return json({ error: "Not Found", path, cleanPath }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(keepWhatsAppAlive(env));
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

async function getCoraAccessToken(env) {
  if (!env.CORA_CLIENT_ID) throw new Error("CORA_CLIENT_ID nao configurado.");
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
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeAsaasMovement(item) {
  const rawValue = readNestedValue(item, ["value", "amount", "netValue", "balance", "feeValue"]);
  const valueNumber = Number(rawValue || 0);
  const typeText = String(item.type || item.transactionType || item.operationType || item.description || "").toUpperCase();
  const isDebit = valueNumber < 0 || /DEBIT|FEE|TAX|TARIFA|SAQUE|TRANSFER|PAYMENT|ANTICIPATION_DEBIT|CHARGEBACK|REFUND/.test(typeText);
  const cents = Math.abs(normalizeMoneyToCents(valueNumber));
  const typeLabel = transactionTypeLabel(item.type || item.transactionType || item.operationType);
  const description = cleanText(item.description || item.title || item.payment?.description || item.paymentDescription);
  const payer = cleanText(item.customer?.name || item.client?.name || item.payer?.name || item.transfer?.recipientName);
  const title = description || typeLabel || (isDebit ? "Saída Asaas" : "Entrada Asaas");
  const detailParts = [
    typeLabel && typeLabel !== title ? typeLabel : "",
    payer,
    cleanText(item.paymentId || item.payment || item.transferId || item.invoiceId || item.object)
  ].filter(Boolean);
  return {
    id: String(item.id || item.transactionId || item.object || `${item.date || item.transactionDate || ""}-${rawValue}-${item.description || typeText}`),
    provider: "asaas",
    type: isDebit ? "saida" : "entrada",
    date: normalizeBankDate(item.date || item.transactionDate || item.createdDate || item.effectiveDate || item.paymentDate),
    amount: cents,
    title,
    description: detailParts.join(" • ") || "Movimentação real do extrato Asaas",
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
    raw: item
  };
}

async function getAsaasMovements(env, { start, end }) {
  const requestUrl = new URL(`${env.ASAAS_BASE_URL}/financialTransactions`);
  requestUrl.searchParams.set("limit", "100");
  requestUrl.searchParams.set("offset", "0");
  requestUrl.searchParams.set("startDate", start);
  requestUrl.searchParams.set("finishDate", end);
  requestUrl.searchParams.set("order", "desc");

  const res = await fetch(requestUrl.toString(), {
    headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0", "accept": "application/json" }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.errors?.[0]?.description || data.message || data.error || "Falha ao consultar extrato Asaas.", items: [], raw: data };
  const items = collectListItems(data).map(normalizeAsaasMovement).filter(item => item.amount > 0);
  return {
    ok: true,
    status: res.status,
    items,
    entradas: items.filter(item => item.type === "entrada"),
    saidas: items.filter(item => item.type === "saida"),
    raw: data
  };
}

async function getCoraStatementPage(env, { start, end, type, page = 1 }) {
  const accessToken = await getCoraAccessToken(env);
  const baseUrl = getCoraBaseUrl(env);
  const fetcher = getCoraFetcher(env);
  const requestUrl = new URL(`${baseUrl}/bank-statement/statement`);
  requestUrl.searchParams.set("start", start);
  requestUrl.searchParams.set("end", end);
  requestUrl.searchParams.set("type", type);
  requestUrl.searchParams.set("page", String(page));
  requestUrl.searchParams.set("perPage", "100");
  requestUrl.searchParams.set("aggr", "false");

  const res = await fetcher.fetch(requestUrl.toString(), {
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.message || data.error_description || data.error || "Falha ao consultar extrato Cora.", items: [], raw: data };
  return { ok: true, status: res.status, items: collectListItems(data), raw: data };
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

async function getAsaasBalance(env) {
  const res = await fetch(`${env.ASAAS_BASE_URL}/finance/balance`, {
    headers: { "access_token": env.ASAAS_API_KEY, "User-Agent": "MCUNightRun/1.0" }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.errors?.[0]?.description || data.message || data.error || "Falha ao consultar Asaas.", raw: data };
  const value = firstNumericValue(data, ["balance", "availableBalance", "available", "value"]);
  return { ok: true, status: res.status, balance: value, balanceCents: normalizeMoneyToCents(value), raw: data };
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
  const pending = await listPendingRegistrations(env, limit);
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

async function listPendingRegistrations(env, limit) {
  const searchUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`;
  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: "nightrun_registrations" }],
      where: { fieldFilter: { field: { fieldPath: "paymentStatus" }, op: "EQUAL", value: { stringValue: "pendente" } } },
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

async function checkCoraInvoiceStatus(env, invoiceId) {
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

async function confirmRegistrationDocument(env, document, ctx, options = {}) {
  const fields = document.fields || {};
  const alreadyPaid = fields.paymentStatus?.stringValue === "pago";
  const phone = fields.telefone?.stringValue?.replace(/\D/g, "") || "";
  const nome = fields.nome?.stringValue?.split(" ")[0] || "Atleta";
  const modalidadeNome = fields.modalidadeNome?.stringValue || fields.modalidade?.stringValue || fields.categoria?.stringValue || "";
  const euVouCardUrl = fields.euVouCardUrl?.stringValue || "";
  const registrationId = document.name?.split("/").pop() || "";
  console.log("[Payment Confirm] Registration data", { registrationId, alreadyPaid, hasPhone: Boolean(phone), nome, hasCard: Boolean(euVouCardUrl), euVouCardUrl });

  if (options.matchedPaymentField === "creditCardAsaasPaymentId") {
    await markRegistrationAsAsaasCreditCard(env, document).catch(error => {
      console.error("[Payment Confirm] Failed to mark credit card provider", { registrationId, error: error.message });
    });
  }

  if (!alreadyPaid) {
    const updateMask = options.manual
      ? "updateMask.fieldPaths=paymentStatus&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=manualPaymentConfirmedAt"
      : "updateMask.fieldPaths=paymentStatus";
    const patchFields = { paymentStatus: { stringValue: "pago" } };
    if (options.manual) {
      const now = new Date().toISOString();
      patchFields.updatedAt = { timestampValue: now };
      patchFields.manualPaymentConfirmedAt = { timestampValue: now };
    }
    const patchRes = await fetch(`https://firestore.googleapis.com/v1/${document.name}?key=${env.FIREBASE_API_KEY}&${updateMask}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: patchFields })
    });
    console.log("[Payment Confirm] Firestore patch", { registrationId, status: patchRes.status, ok: patchRes.ok });
  }

  let notifyResult = null;
  if (phone && (!alreadyPaid || options.forceNotify)) {
    console.log("[Payment Confirm] Sending WhatsApp (Async)", { registrationId, phone: formatPhoneForWhatsApp(phone), forceNotify: Boolean(options.forceNotify), hasCard: Boolean(euVouCardUrl) });
    const sendPromise = sendImmediateMessage({
      phone: formatPhoneForWhatsApp(phone),
      text: buildPaymentConfirmationText(nome, modalidadeNome),
      imageUrl: euVouCardUrl || undefined
    }, env, { skipKvFallback: true })
    .then(res => {
      console.log("[Payment Confirm] WhatsApp async result", { registrationId, res });
      return res;
    })
    .catch(err => {
      console.error("[Payment Confirm] WhatsApp async error", { registrationId, err });
      return { success: false, error: err.message };
    });

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(sendPromise);
      notifyResult = { status: "queued_async" };
    } else {
      notifyResult = await sendPromise;
    }
  } else {
    console.log("[Payment Confirm] WhatsApp skipped", { registrationId, hasPhone: Boolean(phone), alreadyPaid, forceNotify: Boolean(options.forceNotify) });
  }

  return { found: true, alreadyPaid, forcedNotify: Boolean(options.forceNotify), notifyResult };
}

async function queueMessage(msg, env) {
  const key = `mq:pending:${Date.now()}:${crypto.randomUUID().substring(0, 8)}`;
  await env.NIGHTRUN_STORAGE.put(key, JSON.stringify({ ...msg, enqueuedAt: new Date().toISOString() }));
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

  console.log("[WhatsApp Fallback] Trying text only", { phone: msg.phone });
  const textOnly = await sendMessage({ ...msg, imageUrl: "" }, env);
  attempts.push(textOnly);
  console.log("[WhatsApp Fallback] Text only result", { phone: msg.phone, textOnly });
  return { ...textOnly, fallback: "text_only", attempts };
}

async function processQueue(env) {
  const isPaused = await env.NIGHTRUN_STORAGE.get("mq:paused") === "true";
  if (isPaused) return { processed: 0, skipped: "paused" };

  const lock = await env.NIGHTRUN_STORAGE.get("mq:processing");
  if (lock === "true") return { processed: 0, skipped: "already_processing" };

  await env.NIGHTRUN_STORAGE.put("mq:processing", "true", { expirationTtl: 60 });
  try {
    const limit = Number(env.WHATSAPP_QUEUE_LIMIT || 60);
    const concurrency = 1;
    const list = await env.NIGHTRUN_STORAGE.list({ prefix: "mq:pending:", limit });
    if (list.keys.length === 0) return { processed: 0 };

    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < list.keys.length; i += concurrency) {
      const chunk = list.keys.slice(i, i + concurrency);
      const results = await Promise.allSettled(chunk.map(async (key, index) => {
        const data = await env.NIGHTRUN_STORAGE.get(key.name);
        if (!data) return;

        const msg = JSON.parse(data);
        if (msg.type === "registration_notice") {
          msg.imageUrl = "";
        }
        await sleep(index * Number(env.WHATSAPP_QUEUE_STAGGER_MS || 150));
        const result = await sendMessageWithFallback(msg, env);
        await logToFirestore(msg, result, env);

        if (result.success) {
          await env.NIGHTRUN_STORAGE.delete(key.name);
          return { success: true, result };
        } else {
          await markQueueFailure(key.name, msg, result, env);
          return { success: false, result };
        }
      }));

      for (const item of results) {
        if (item.status === "fulfilled") {
          processed++;
          if (item.value?.success) sent++;
          else failed++;
        } else {
          processed++;
          failed++;
          console.error("Queue chunk error:", item.reason);
        }
      }
    }

    return { processed, sent, failed, remainingHint: list.list_complete === false };
  } finally {
    await env.NIGHTRUN_STORAGE.delete("mq:processing");
  }
}

async function sendMessage(msg, env) {
  const normalizedPhone = formatPhoneForWhatsApp(msg.phone);
  const selectedInstance = await chooseWhatsAppInstance(env, msg.instanceName || "");
  const instanceName = selectedInstance.instanceName;
  console.log("[WhatsApp Send] Start", { phone: msg.phone, normalizedPhone, hasImage: Boolean(msg.imageUrl), instanceName, instanceSource: selectedInstance.source });
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
  const throttle = await throttleWhatsAppInstance(env, instanceName);
  if (throttle.waitedMs > 0) {
    console.log("[WhatsApp Send] Instance throttle", { instanceName, waitedMs: throttle.waitedMs });
  }
  const isMedia = !!msg.imageUrl;
  const endpoint = isMedia ? `/message/sendMedia/${instanceName}` : `/message/sendText/${instanceName}`;
  const payload = { number: normalizedPhone };

  if (isMedia) {
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
  if (attempts >= Number(env.WHATSAPP_QUEUE_MAX_ATTEMPTS || 3)) {
    await env.NIGHTRUN_STORAGE.delete(key);
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
