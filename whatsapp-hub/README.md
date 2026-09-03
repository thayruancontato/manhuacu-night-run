# WhatsApp Hub

Microservice multi-tenant de mensageria WhatsApp agendada/transacional. Extraído do worker do MCU Night Run — qualquer sistema (o próprio MCU, um sistema esportivo, o próximo projeto) se cadastra como **instância** e traz seu próprio número, sua própria fonte/paleta de card e seus próprios dados.

Ver o plano de arquitetura completo (5 fases) no artifact publicado na conversa. Este README cobre só a **Fase 1**: o serviço em pé, com fila, roteamento de número, throttle, retry e o motor de card genérico funcionando.

## Deploy

```
https://whatsapp-hub.thayrufino2.workers.dev
```

Stack: Cloudflare Workers (Hono + Zod) · D1 (`whatsapp_hub_db`) · KV (`HUB_STORAGE`) · R2 (`whatsapp-hub-assets`) · Cloudflare Queues (`whatsapp-hub-outbox` + DLQ).

## Conceitos

- **Instância** = tenant. Tem uma API key própria, números de WhatsApp próprios, templates próprios. Nunca enxerga dado de outra instância.
- **Número** = um "chip" na Evolution API. Pertence a exatamente uma instância. Uma instância pode ter mais de um (round-robin entre eles).
- **Template** = texto com merge fields `{{chave}}`, ou um `card_config` (cor, fonte, campos posicionados) que vira um PNG renderizado a partir do payload livre enviado em cada mensagem.
- **Mensagem** = o que efetivamente sai pro WhatsApp. Todo envio passa pela Cloudflare Queue — nunca é síncrono na chamada da API.

## Criando uma instância (bootstrap)

Só quem tem o segredo do operador do serviço (`ADMIN_BOOTSTRAP_SECRET`, um Wrangler secret) pode criar tenants:

```bash
curl -X POST https://whatsapp-hub.thayrufino2.workers.dev/v1/instances \
  -H "X-Bootstrap-Secret: <segredo>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Sistema Esportivo X"}'
# → { "id": "inst_...", "apiKey": "whk_..." }  — a apiKey só aparece essa vez
```

A partir daqui, tudo é autenticado com `Authorization: Bearer whk_...`.

## Registrando um número

```bash
curl -X POST https://whatsapp-hub.thayrufino2.workers.dev/v1/numbers \
  -H "Authorization: Bearer whk_..." -H "Content-Type: application/json" \
  -d '{
    "label": "Principal",
    "role": "both",
    "evolutionBaseUrl": "https://sua-evolution.fly.dev",
    "evolutionApiKey": "...",
    "evolutionInstanceName": "meu_numero"
  }'
```

Isso já dispara a criação da instância na Evolution API. Para parear (escanear QR):

```bash
curl https://whatsapp-hub.thayrufino2.workers.dev/v1/numbers/<numberId>/qr \
  -H "Authorization: Bearer whk_..."
```

## Enviando uma fonte (para cards com tipografia própria)

```bash
curl -X POST https://whatsapp-hub.thayrufino2.workers.dev/v1/fonts \
  -H "Authorization: Bearer whk_..." \
  -F "file=@./MinhaFonte-Bold.ttf" \
  -F "familyName=MinhaFonte"
# → { "id": "fnt_..." }
```

Aceita TTF/OTF, até 2MB. Se nenhuma fonte for referenciada num `card_config`, o Hub usa uma fonte padrão embutida.

## Criando um template

Texto:

```bash
curl -X POST .../v1/templates -H "Authorization: Bearer whk_..." -H "Content-Type: application/json" -d '{
  "name": "cobranca_pendente",
  "kind": "text",
  "textBody": "Oi {{nome}}, sua inscrição ainda está pendente. Pague aqui: {{link}}"
}'
```

Card (imagem gerada na hora):

```bash
curl -X POST .../v1/templates -H "Authorization: Bearer whk_..." -H "Content-Type: application/json" -d '{
  "name": "convocacao_jogo",
  "kind": "card",
  "cardConfig": {
    "width": 700, "height": 900,
    "backgroundColor": "#0B1F3A",
    "accentColor": "#FF7A1A",
    "fontId": "fnt_...",
    "fields": [
      { "key": "titulo", "x": 60, "y": 120, "size": 42 },
      { "key": "adversario", "x": 60, "y": 200, "size": 64 },
      { "key": "data", "x": 60, "y": 780, "size": 96, "align": "start" }
    ]
  }
}'
```

## Enviando uma mensagem

```bash
curl -X POST .../v1/messages -H "Authorization: Bearer whk_..." -H "Content-Type: application/json" -d '{
  "to": "5511999999999",
  "templateId": "tpl_...",
  "data": { "nome": "Maria", "titulo": "PRÓXIMO JOGO", "adversario": "vs. Tigres FC", "data": "14/09" },
  "requireImage": false,
  "maxAttempts": 5
}'
# → 202 { "id": "msg_...", "status": "pending" }
```

Sem `templateId`, mande `text` direto no corpo. Acompanhe:

```bash
curl .../v1/messages/msg_... -H "Authorization: Bearer whk_..."
curl ".../v1/messages?status=dead" -H "Authorization: Bearer whk_..."
```

## Envios recorrentes

```bash
# destinatários fixos, embutidos no job
curl -X POST .../v1/scheduled-jobs -H "Authorization: Bearer whk_..." -H "Content-Type: application/json" -d '{
  "templateId": "tpl_...",
  "cronExpr": "0 9 * * 1",
  "recipientsMode": "static",
  "recipientsStatic": [{ "to": "5511999999999", "data": { "nome": "Maria" } }]
}'

# ou destinatários resolvidos por um webhook que a própria instância expõe
curl -X POST .../v1/scheduled-jobs -H "Authorization: Bearer whk_..." -H "Content-Type: application/json" -d '{
  "templateId": "tpl_...",
  "cronExpr": "*/15 * * * *",
  "recipientsMode": "webhook",
  "recipientsWebhookUrl": "https://seu-sistema.com/api/whatsapp-recipients"
}'
# o Hub espera { "recipients": [{ "to": "...", "data": {...} }] } de volta
```

`cronExpr` é padrão de 5 campos (min hora dia-mês mês dia-semana). Pausar sem apagar: `PATCH /v1/scheduled-jobs/:id {"active": false}`.

## O que a Fase 1 já garante

- Fila real (Cloudflare Queue) com retry exponencial e dead-letter — nada fica preso esperando um cron.
- Throttle de 30s por número e round-robin entre números ativos da mesma instância (idêntico ao comportamento do worker do MCU, só que escopado por tenant).
- Fallback de imagem → texto puro quando a mídia falha (a menos que `requireImage: true`).
- Renderização de card com `@resvg/resvg-wasm`, cor/fonte/campos 100% configuráveis por template, cache do PNG em R2 por hash de (template + dados).
- Isolamento total entre instâncias no schema — testado com a instância `MCU Night Run` já criada em produção.

## Progresso das fases 2–5

- ✅ **Número real de produção do MCU registrado** (`vivo_bkp_2`, mesma Evolution API de produção) sob a instância `MCU Night Run` — credencial real, `GET /v1/numbers` confirma `state: open`. A migração da credencial foi feita via um endpoint temporário no worker antigo, usado uma vez e removido em seguida.
  - Nota histórica: no meio do caminho gastei tempo tentando "consertar" um número diferente (`mcu_nightrun_uba`) que parecia travado em `connecting`. Era um desvio — esse número nunca foi o de produção de verdade, só o valor default de uma env var (`INSTANCE_NAME` no `wrangler.toml` do worker do MCU) usado como fallback sempre que a leitura do Firestore falhava (o worker lia `system_settings/nightrun_whatsapp` sem autenticação, e essa coleção exige admin — 403 silencioso, cai no fallback). O número real (`vivo_bkp_2`) esteve conectado o tempo todo. Corrigido no worker do MCU trocando o valor da env var; os números de teste criados durante a investigação (num fly.io e num Evolution API novo numa EC2) foram desconectados e removidos depois.
- ✅ **Três templates portados e validados via `/v1/templates/:id/preview`** (sem enviar nada de verdade): `mcu_payment_confirmation` (texto), `mcu_pending_charge` (texto), `mcu_resumo_operacional_card` (card — mesma paleta navy/lima do banner original, confirmado visualmente).
- ✅ **Mensagem real enviada e entregue pelo número de produção** (`vivo_bkp_2`) via `POST /v1/messages` — confirmado `status: sent` de ponta a ponta (fila → Evolution → WhatsApp).
- ✅ **Envios recorrentes (`scheduled_jobs`) implementados e testados**: cron trigger a cada minuto (`src/lib/cron.ts`, matcher de 5 campos sem dependência externa), `POST/GET/PATCH/DELETE /v1/scheduled-jobs`, destinatários por lista estática (`recipientsMode: "static"`) ou por webhook que a própria instância expõe (`"webhook"` — o Hub nunca lê a tabela de domínio de ninguém). Testado com um job "a cada minuto" real: disparou, resolveu o destinatário, montou a mensagem pelo template e entregou (`status: sent`).
- 🚧 **Fase 4 iniciada**: `AdminMensagensPersonalizadas.tsx` (a mais simples das 5 páginas de mensagens do painel) já chama o Hub. Não é uma chamada direta do navegador — o worker do MCU ganhou uma rota proxy (`POST /hub/messages`) que repassa pro Hub usando **Service Binding** (não fetch por URL pública: Workers não podem se chamar entre si via `*.workers.dev`, a Cloudflare bloqueia com erro 1042 — só descobri isso tentando). A `WHATSAPP_HUB_API_KEY` fica só no servidor, nunca no bundle do frontend. Testado end-to-end pelo navegador de verdade: `status: sent`. As outras 4 páginas (`AdminMensagensConfig`, `AdminMensagensFila`, `AdminMensagensHistorico`, `AdminMensagens`) ainda não foram migradas — têm lógica bem mais acoplada ao Firestore do MCU (fila, histórico, números) que merece ser portada com mais cuidado.
- ⏳ Onboarding de um segundo sistema como prova de multi-tenant (fase 5).
- ⏳ SDK cliente (pacote npm fino) — a API REST já é suficiente para integrar sem ele.
- **Gap conhecido**: o motor de card (v1) só desenha campos de texto — não embute imagem/logo como o banner original fazia. Dá pra adicionar um `imageFields` no `card_config` (mesmo padrão de upload das fontes) quando precisar.
