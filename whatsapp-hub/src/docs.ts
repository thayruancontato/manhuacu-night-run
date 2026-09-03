export const DOCS_PAGE = `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WhatsApp Hub — Documentação</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #F2F5F6; --surface: #FFFFFF; --surface-2: #E7EDEF;
    --ink: #10202A; --ink-muted: #526069; --ink-faint: #7C8891;
    --border: #D6DFE2; --border-soft: #E4EAEC;
    --accent: #0D7A80; --accent-strong: #085E63; --accent-soft: #E1F1F0;
    --warn: #96701A; --warn-soft: #F5EBD6;
    --code-bg: #0F2229; --code-ink: #CDE7E4;
    --shadow: 0 1px 2px rgba(16,32,42,0.04), 0 8px 24px -12px rgba(16,32,42,0.12);
    --radius: 14px; --radius-sm: 8px;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0C1417; --surface: #121C20; --surface-2: #182428;
      --ink: #E7EFF0; --ink-muted: #97A6AC; --ink-faint: #6E7C82;
      --border: #253338; --border-soft: #1D2A2F;
      --accent: #4FD1C7; --accent-strong: #7BE0D6; --accent-soft: rgba(79,209,199,0.12);
      --warn: #E0B155; --warn-soft: rgba(224,177,85,0.12);
      --code-bg: #0A1519; --code-ink: #A9D8D3;
      --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 12px 28px -14px rgba(0,0,0,0.55);
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0C1417; --surface: #121C20; --surface-2: #182428;
    --ink: #E7EFF0; --ink-muted: #97A6AC; --ink-faint: #6E7C82;
    --border: #253338; --border-soft: #1D2A2F;
    --accent: #4FD1C7; --accent-strong: #7BE0D6; --accent-soft: rgba(79,209,199,0.12);
    --warn: #E0B155; --warn-soft: rgba(224,177,85,0.12);
    --code-bg: #0A1519; --code-ink: #A9D8D3;
    --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 12px 28px -14px rgba(0,0,0,0.55);
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:"IBM Plex Sans",system-ui,sans-serif; font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased; }
  ::selection { background: var(--accent-soft); color: var(--accent-strong); }
  a { color: var(--accent-strong); }
  h1,h2,h3,h4 { font-family:"Sora","IBM Plex Sans",sans-serif; color:var(--ink); text-wrap:balance; margin:0; }
  code, .mono { font-family:"IBM Plex Mono", ui-monospace, monospace; }
  .shell { max-width: 1180px; margin: 0 auto; padding: 0 28px 120px; }
  .masthead { padding: 56px 0 40px; border-bottom: 1px solid var(--border); }
  .eyebrow-row { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px; }
  .chip { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:999px; border:1px solid var(--border); background:var(--surface); color:var(--ink-muted); font-size:.72rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase; }
  .chip.accent { border-color:transparent; background:var(--accent-soft); color:var(--accent-strong); }
  .masthead h1 { font-size:clamp(2rem,4vw,2.8rem); font-weight:800; letter-spacing:-.01em; line-height:1.08; max-width:18ch; }
  .masthead .dek { margin-top:16px; max-width:64ch; font-size:1.05rem; color:var(--ink-muted); }
  .layout { display:grid; grid-template-columns:220px minmax(0,1fr); gap:56px; padding-top:40px; align-items:start; }
  .toc { position:sticky; top:24px; display:flex; flex-direction:column; gap:2px; max-height:calc(100vh - 48px); overflow-y:auto; }
  .toc-label { font-size:.68rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); margin-bottom:8px; }
  .toc a { text-decoration:none; color:var(--ink-muted); font-size:.85rem; padding:5px 0 5px 12px; border-left:2px solid var(--border-soft); }
  .toc a:hover { color:var(--accent-strong); border-color:var(--accent); }
  main { min-width:0; }
  section { margin-bottom:64px; scroll-margin-top:24px; }
  h2 { font-size:1.4rem; font-weight:700; margin-bottom:16px; }
  h3 { font-size:1.05rem; font-weight:700; margin:28px 0 10px; }
  section > p, .prose p { max-width:74ch; color:var(--ink-muted); }
  section > p + p { margin-top:12px; }
  .lede { font-size:1rem; max-width:70ch; color:var(--ink-muted); margin-bottom:22px; }
  pre { background:var(--code-bg); color:var(--code-ink); border-radius:var(--radius); padding:18px 20px; overflow-x:auto; font-size:.82rem; line-height:1.6; box-shadow:var(--shadow); margin:14px 0; }
  pre code { font-family:"IBM Plex Mono"; }
  p code, li code, td code { font-size:.85em; background:var(--surface-2); padding:1px 6px; border-radius:4px; }
  .endpoint { border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); padding:18px 20px; margin:16px 0; box-shadow:var(--shadow); }
  .endpoint-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
  .method { font-family:"IBM Plex Mono"; font-size:.72rem; font-weight:700; padding:3px 9px; border-radius:5px; background:var(--accent-soft); color:var(--accent-strong); }
  .method.get { background:var(--surface-2); color:var(--ink-muted); }
  .method.delete { background:var(--warn-soft); color:var(--warn); }
  .path { font-family:"IBM Plex Mono"; font-size:.92rem; font-weight:600; }
  .auth-badge { font-size:.68rem; color:var(--ink-faint); border:1px solid var(--border); border-radius:5px; padding:2px 7px; }
  .endpoint p { margin: 8px 0 0; font-size:.9rem; }
  .table-wrap { overflow-x:auto; margin-top:14px; border:1px solid var(--border); border-radius:var(--radius); }
  table { width:100%; border-collapse:collapse; font-size:.85rem; background:var(--surface); }
  thead th { text-align:left; font-size:.66rem; letter-spacing:.05em; text-transform:uppercase; color:var(--ink-faint); font-weight:700; padding:10px 14px; background:var(--surface-2); border-bottom:1px solid var(--border); white-space:nowrap; }
  tbody td { padding:10px 14px; border-bottom:1px solid var(--border-soft); color:var(--ink-muted); vertical-align:top; }
  tbody tr:last-child td { border-bottom:none; }
  tbody td:first-child { color:var(--ink); }
  .callout { border:1px solid var(--border); border-left:3px solid var(--accent); background:var(--surface); border-radius:0 var(--radius) var(--radius) 0; padding:16px 20px; margin:16px 0; }
  .callout.warn { border-left-color:var(--warn); }
  .callout-title { font-size:.7rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--accent-strong); margin-bottom:6px; }
  .callout.warn .callout-title { color:var(--warn); }
  .callout p { margin:0; font-size:.88rem; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:16px; }
  @media (max-width:700px) { .grid2 { grid-template-columns:1fr; } .layout { grid-template-columns:1fr; } .toc { position:static; flex-direction:row; flex-wrap:wrap; gap:6px 16px; max-height:none; } .toc-label{display:none;} .toc a{border-left:none;border-bottom:2px solid var(--border-soft);padding:4px 0;} }
  .field-card { border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--surface); padding:14px 16px; }
  .field-card h4 { font-size:.86rem; font-weight:700; margin-bottom:4px; }
  .field-card p { font-size:.82rem; color:var(--ink-muted); margin:0; }
  footer { margin-top:70px; padding-top:20px; border-top:1px solid var(--border); font-size:.78rem; color:var(--ink-faint); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; }
</style>
</head>
<body>
<div class="shell">
  <header class="masthead">
    <div class="eyebrow-row">
      <span class="chip accent">Documentação</span>
      <span class="chip">API v1</span>
      <span class="chip">Multi-tenant</span>
    </div>
    <h1>WhatsApp Hub</h1>
    <p class="dek">Microservice de mensageria WhatsApp — fila com retry, roteamento de número por instância, cards renderizados sob demanda e envios recorrentes. Uma API só, várias instâncias isoladas.</p>
  </header>

  <div class="layout">
    <nav class="toc">
      <span class="toc-label">Nesta página</span>
      <a href="#inicio-rapido">Início rápido</a>
      <a href="#conceitos">Conceitos</a>
      <a href="#autenticacao">Autenticação</a>
      <a href="#numeros">Números</a>
      <a href="#fontes">Fontes</a>
      <a href="#templates">Templates</a>
      <a href="#cards">Motor de cards</a>
      <a href="#mensagens">Mensagens</a>
      <a href="#agendamentos">Envios recorrentes</a>
      <a href="#erros">Erros</a>
      <a href="#limites">Limites</a>
    </nav>

    <main>

      <section id="inicio-rapido">
        <h2>Início rápido</h2>
        <p class="lede">Toda instância (tenant) tem sua própria API key, seus próprios números de WhatsApp e seus próprios templates. Nada é compartilhado entre instâncias.</p>
        <h3>1. Criar uma instância</h3>
        <p>Só o operador do serviço faz isso (segredo de bootstrap, não é a API key de nenhuma instância):</p>
        <pre><code>curl -X POST https://SEU-HOST/v1/instances \\
  -H "X-Bootstrap-Secret: &lt;segredo-do-operador&gt;" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Meu Sistema"}'

# → { "id": "inst_...", "apiKey": "whk_..." }  — a apiKey só aparece essa vez, guarde agora</code></pre>
        <h3>2. Registrar um número</h3>
        <pre><code>curl -X POST https://SEU-HOST/v1/numbers \\
  -H "Authorization: Bearer whk_..." -H "Content-Type: application/json" \\
  -d '{
    "label": "Principal",
    "role": "both",
    "evolutionBaseUrl": "https://sua-evolution.exemplo.com",
    "evolutionApiKey": "...",
    "evolutionInstanceName": "meu_numero"
  }'</code></pre>
        <h3>3. Enviar uma mensagem</h3>
        <pre><code>curl -X POST https://SEU-HOST/v1/messages \\
  -H "Authorization: Bearer whk_..." -H "Content-Type: application/json" \\
  -d '{"to": "5511999999999", "text": "Olá! Isso é um teste."}'

# → 202 { "id": "msg_...", "status": "pending" }</code></pre>
        <div class="callout">
          <div class="callout-title">Toda mensagem é assíncrona</div>
          <p>O envio nunca é síncrono na chamada da API — a mensagem entra numa fila real (Cloudflare Queue) com retry exponencial. Consulte o status por <code>GET /v1/messages/:id</code>.</p>
        </div>
      </section>

      <section id="conceitos">
        <h2>Conceitos</h2>
        <div class="grid2">
          <div class="field-card"><h4>Instância</h4><p>Um tenant. Tem API key própria, números próprios, templates próprios. Isolamento total no schema — nunca cruza dados com outra instância.</p></div>
          <div class="field-card"><h4>Número</h4><p>Um "chip" WhatsApp (instância Evolution API). Pertence a exatamente uma instância. Uma instância pode ter vários números — o Hub roda round-robin entre os ativos.</p></div>
          <div class="field-card"><h4>Template</h4><p>Texto com campos <code>{{chave}}</code>, ou um <code>card_config</code> que vira imagem renderizada na hora. Sempre pertence a uma instância.</p></div>
          <div class="field-card"><h4>Mensagem</h4><p>O envio de fato. Carrega um payload de dados livre — o Hub nunca conhece o domínio de quem o está usando.</p></div>
          <div class="field-card"><h4>Job agendado</h4><p>Um envio recorrente (cron). Resolve destinatários por lista fixa ou por um webhook que a própria instância expõe.</p></div>
          <div class="field-card"><h4>Fonte</h4><p>Um arquivo TTF/OTF enviado por upload, referenciado por um template de card para tipografia própria.</p></div>
        </div>
      </section>

      <section id="autenticacao">
        <h2>Autenticação</h2>
        <p>Toda rota abaixo de <code>/v1/*</code> (exceto <code>/v1/instances</code>, que usa o segredo de bootstrap) exige:</p>
        <pre><code>Authorization: Bearer whk_&lt;sua chave&gt;</code></pre>
        <p>A chave é gerada uma única vez na criação da instância e guardada como hash — se perder, use o endpoint de rotação (fora do escopo desta página v1) para gerar uma nova.</p>
        <div class="callout warn">
          <div class="callout-title">Nunca no navegador</div>
          <p>Se você está integrando um app com frontend público, não chame o Hub direto do navegador — a chave ficaria exposta no bundle. Proxie a chamada pelo seu próprio backend, guardando a chave só lá.</p>
        </div>
      </section>

      <section id="numeros">
        <h2>Números</h2>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method">POST</span><span class="path">/v1/numbers</span><span class="auth-badge">requer API key</span></div>
          <p>Registra um número e já dispara a criação da instância correspondente na Evolution API.</p>
          <pre><code>{
  "label": "Principal",
  "role": "send" | "receive" | "both",
  "evolutionBaseUrl": "https://...",
  "evolutionApiKey": "...",
  "evolutionInstanceName": "meu_numero"
}
→ 201 { "id": "num_...", "evolutionCreate": { "ok": true, "body": {...} } }</code></pre>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method get">GET</span><span class="path">/v1/numbers</span><span class="auth-badge">requer API key</span></div>
          <p>Lista os números da instância com o estado de conexão em tempo real (consulta a Evolution API na hora).</p>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method get">GET</span><span class="path">/v1/numbers/:id/qr</span><span class="auth-badge">requer API key</span></div>
          <p>Retorna o QR code atual de pareamento (<code>{ "qr": "data:image/png;base64,..." }</code>). Expira rápido — para uma tela de pareamento que se atualiza sozinha, use o link ao vivo abaixo.</p>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method">POST</span><span class="path">/v1/numbers/:id/qr-live-link</span><span class="auth-badge">requer API key</span></div>
          <p>Gera um link temporário (10 min) para uma página HTML que atualiza o QR sozinha e detecta quando a conexão abre — útil para mandar para quem vai escanear, sem precisar reenviar imagem manualmente.</p>
          <pre><code>→ 200 { "url": "https://SEU-HOST/qr-live/&lt;token&gt;", "expiresInSeconds": 600 }</code></pre>
        </div>
      </section>

      <section id="fontes">
        <h2>Fontes</h2>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method">POST</span><span class="path">/v1/fonts</span><span class="auth-badge">requer API key · multipart</span></div>
          <p>Upload de uma fonte TTF/OTF (até 2MB, validada por magic bytes) para usar em templates de card.</p>
          <pre><code>curl -X POST .../v1/fonts -H "Authorization: Bearer whk_..." \\
  -F "file=@./MinhaFonte-Bold.ttf" -F "familyName=MinhaFonte"
→ 201 { "id": "fnt_...", "familyName": "MinhaFonte" }</code></pre>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method get">GET</span><span class="path">/v1/fonts</span><span class="auth-badge">requer API key</span></div>
          <p>Lista as fontes já enviadas pela instância.</p>
        </div>
      </section>

      <section id="templates">
        <h2>Templates</h2>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method">POST</span><span class="path">/v1/templates</span><span class="auth-badge">requer API key</span></div>
          <p>Cria ou atualiza (por <code>name</code>) um template de texto ou card.</p>
          <pre><code>// texto — merge fields resolvidos contra o "data" enviado na mensagem
{ "name": "boas_vindas", "kind": "text", "textBody": "Olá {{nome}}, seja bem-vindo!" }

// card — ver seção "Motor de cards" abaixo
{ "name": "convite", "kind": "card", "cardConfig": { ... } }</code></pre>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method get">GET</span><span class="path">/v1/templates</span><span class="auth-badge">requer API key</span></div>
          <p>Lista os templates da instância.</p>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method">POST</span><span class="path">/v1/templates/:id/preview</span><span class="auth-badge">requer API key</span></div>
          <p>Renderiza o template com um <code>data</code> de teste <strong>sem enviar nada</strong>. Para <code>kind:"card"</code>, devolve o PNG direto (<code>Content-Type: image/png</code>); para <code>kind:"text"</code>, devolve o texto resolvido em JSON.</p>
        </div>
      </section>

      <section id="cards">
        <h2>Motor de cards</h2>
        <p class="lede">Um template de card é um layout declarativo: cor de fundo, cor de destaque, fonte (opcional, referenciando um upload) e uma lista de campos de texto posicionados. No envio, o Hub resolve os valores contra o <code>data</code> da mensagem e renderiza um PNG na hora — sem headless browser, via <code>@resvg/resvg-wasm</code>.</p>
        <pre><code>{
  "width": 700, "height": 900,
  "backgroundColor": "#0B1F3A",
  "accentColor": "#FF7A1A",
  "fontId": "fnt_...",          // opcional — sem isso, usa a fonte padrão embutida
  "fields": [
    { "key": "titulo", "x": 60, "y": 120, "size": 42, "align": "start" },
    { "key": "data",   "x": 350, "y": 780, "size": 96, "align": "middle", "color": "#FF7A1A" }
  ]
}</code></pre>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Campo</th><th>Tipo</th><th>Descrição</th></tr></thead>
            <tbody>
              <tr><td><code>key</code></td><td>string</td><td>Chave lida em <code>data[key]</code> no momento do envio.</td></tr>
              <tr><td><code>x</code>, <code>y</code></td><td>number</td><td>Posição do texto em pixels (origem no canto superior esquerdo).</td></tr>
              <tr><td><code>size</code></td><td>number</td><td>Tamanho da fonte em pixels.</td></tr>
              <tr><td><code>align</code></td><td>start · middle · end</td><td>Alinhamento horizontal relativo a <code>x</code>.</td></tr>
              <tr><td><code>color</code></td><td>string</td><td>Cor do texto (hex). Se omitido, usa <code>accentColor</code> do card.</td></tr>
              <tr><td><code>weight</code></td><td>number</td><td>Peso da fonte (padrão 700).</td></tr>
            </tbody>
          </table>
        </div>
        <p>O PNG renderizado é cacheado no R2 por hash de (template + dados) — reenviar o mesmo conteúdo (ex.: o banner do dia) não paga o custo de renderizar de novo.</p>
      </section>

      <section id="mensagens">
        <h2>Mensagens</h2>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method">POST</span><span class="path">/v1/messages</span><span class="auth-badge">requer API key</span></div>
          <p>Envia uma mensagem — com template ou com texto/imagem direto no corpo.</p>
          <pre><code>{
  "to": "5511999999999",
  "templateId": "tpl_...",          // opcional — se ausente, use "text"
  "text": "...",                     // opcional se templateId presente
  "imageUrl": "https://...",         // opcional — passthrough direto, sem renderizar
  "data": { "nome": "Maria" },       // valores para os merge fields do template
  "requireImage": false,             // se true, nunca cai pra fallback texto-only
  "maxAttempts": 5
}
→ 202 { "id": "msg_...", "status": "pending" }</code></pre>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method get">GET</span><span class="path">/v1/messages/:id</span><span class="auth-badge">requer API key</span></div>
          <p>Status, tentativas e a trilha completa de eventos de uma mensagem.</p>
          <pre><code>{
  "id": "msg_...", "status": "sent" | "pending" | "failed" | "dead",
  "attempts": 0, "to_phone": "...", "sent_at": "...",
  "events": [ { "event": "queued", "at": "..." }, { "event": "sent", "detail": {...}, "at": "..." } ]
}</code></pre>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method get">GET</span><span class="path">/v1/messages?status=dead&amp;limit=50</span><span class="auth-badge">requer API key</span></div>
          <p>Lista mensagens da instância, opcionalmente filtradas por status.</p>
        </div>
        <h3>Ciclo de vida</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Status</th><th>Significado</th></tr></thead>
            <tbody>
              <tr><td><code>pending</code></td><td>Na fila ou aguardando o intervalo mínimo entre envios do número.</td></tr>
              <tr><td><code>sent</code></td><td>Entregue à Evolution API com sucesso.</td></tr>
              <tr><td><code>failed</code></td><td>Falhou de forma não recuperável nesta tentativa (ex.: nenhum número ativo).</td></tr>
              <tr><td><code>dead</code></td><td>Esgotou as tentativas — vai para a dead-letter queue e para de tentar sozinha.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="agendamentos">
        <h2>Envios recorrentes</h2>
        <p class="lede">O Hub nunca lê a tabela de dados de ninguém. Para um envio recorrente, você escolhe como ele descobre os destinatários a cada execução: uma lista fixa, ou um webhook que o seu próprio sistema expõe.</p>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method">POST</span><span class="path">/v1/scheduled-jobs</span><span class="auth-badge">requer API key</span></div>
          <pre><code>// destinatários fixos
{
  "templateId": "tpl_...",
  "cronExpr": "0 9 * * 1",              // min hora dia-mês mês dia-semana (UTC)
  "recipientsMode": "static",
  "recipientsStatic": [{ "to": "5511999999999", "data": { "nome": "Maria" } }]
}

// destinatários resolvidos por webhook, a cada execução
{
  "templateId": "tpl_...",
  "cronExpr": "*/15 * * * *",
  "recipientsMode": "webhook",
  "recipientsWebhookUrl": "https://seu-sistema.com/api/whatsapp-recipients"
}
// o Hub espera de volta: { "recipients": [{ "to": "...", "data": {...} }] }</code></pre>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method get">GET</span><span class="path">/v1/scheduled-jobs</span><span class="auth-badge">requer API key</span></div>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method">PATCH</span><span class="path">/v1/scheduled-jobs/:id</span><span class="auth-badge">requer API key</span></div>
          <p>Pausa ou reativa sem apagar: <code>{ "active": false }</code>.</p>
        </div>
        <div class="endpoint">
          <div class="endpoint-head"><span class="method delete">DELETE</span><span class="path">/v1/scheduled-jobs/:id</span><span class="auth-badge">requer API key</span></div>
        </div>
        <div class="callout">
          <div class="callout-title">Cron suportado</div>
          <p>Padrão de 5 campos. Suporta asterisco, número, lista (<code>1,2,3</code>) e passo (<code>*/15</code>). Não cobre ranges (<code>1-5</code>) — quebre em vários jobs se precisar disso.</p>
        </div>
      </section>

      <section id="erros">
        <h2>Erros</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Status</th><th>Corpo</th><th>Quando</th></tr></thead>
            <tbody>
              <tr><td>400</td><td><code>{ "error": "invalid_body", "details": {...} }</code></td><td>Payload não passou na validação (Zod) — <code>details</code> tem o motivo por campo.</td></tr>
              <tr><td>401</td><td><code>{ "error": "missing_api_key" }</code> / <code>invalid_api_key</code></td><td>Header <code>Authorization</code> ausente ou chave inválida.</td></tr>
              <tr><td>404</td><td><code>{ "error": "not_found" }</code> (ou <code>*_not_found</code>)</td><td>Recurso não existe ou não pertence à instância autenticada.</td></tr>
              <tr><td>409</td><td><code>{ "error": "already_exists" }</code></td><td>Conflito de unicidade (ex.: template com nome repetido).</td></tr>
              <tr><td>413</td><td><code>{ "error": "file_too_large" }</code></td><td>Upload de fonte acima de 2MB.</td></tr>
              <tr><td>500</td><td><code>{ "error": "internal_error", "details": "..." }</code></td><td>Erro não esperado — o <code>details</code> ajuda a diagnosticar, mas não é um contrato estável.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="limites">
        <h2>Limites e comportamento operacional</h2>
        <ul>
          <li><strong>Intervalo entre envios por número:</strong> 30s (configurável por deployment via <code>WHATSAPP_INSTANCE_DELAY_MS</code>) — mensagens que caem antes disso são reagendadas automaticamente, não descartadas.</li>
          <li><strong>Retry:</strong> backoff de até 4 tentativas na fila antes de cair na dead-letter queue; mensagens com imagem que falha caem para texto puro, a menos que <code>requireImage: true</code>.</li>
          <li><strong>Upload de fonte:</strong> 2MB, apenas TTF/OTF válidos (checado por magic bytes, não só pela extensão do arquivo).</li>
          <li><strong>Cron:</strong> avaliado a cada minuto; um job não dispara duas vezes no mesmo minuto mesmo que o avaliador rode mais de uma vez nesse intervalo.</li>
          <li><strong>Isolamento:</strong> toda consulta é filtrada por <code>instance_id</code> no banco — não existe endpoint que liste dados entre instâncias.</li>
        </ul>
      </section>

    </main>
  </div>

  <footer>
    <span>WhatsApp Hub — API v1</span>
    <span>Multi-tenant · Cloudflare Workers</span>
  </footer>
</div>
</body>
</html>`;
