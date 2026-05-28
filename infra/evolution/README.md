# MCU Night Run WhatsApp Server

Infraestrutura propria para WhatsApp usando Evolution API v2, Redis, Neon Postgres e Cloudflare Tunnel.

## O Que Foi Criado

- `docker-compose.yml`: sobe Evolution API, Redis e Cloudflare Tunnel.
- `.env.example`: modelo seguro das variaveis.
- Perfil opcional `local-db`: sobe Postgres local para desenvolvimento.
- Projeto Neon criado: `bitter-heart-90280264`, branch `main`, banco `neondb`.

## Fluxo

```text
App / Worker Cloudflare
  -> /whatsapp/*
  -> Evolution API via Cloudflare Tunnel
  -> Redis para cache
  -> Neon Postgres para persistencia
  -> WhatsApp Baileys
```

## Subir Em Producao

1. Copie o env:

```bash
cp .env.example .env
```

2. Edite `.env`:

- `AUTHENTICATION_API_KEY`: uma chave longa e aleatoria.
- `DATABASE_CONNECTION_URI`: connection string pooled do Neon.
- `REDIS_PASSWORD`: senha forte.
- `CACHE_REDIS_URI`: use a mesma senha do Redis.
- `SERVER_URL`: hostname publico no Cloudflare, por exemplo `https://whatsapp.seu-dominio.com`.
- `CLOUDFLARED_TOKEN`: token do tunnel criado no Cloudflare Zero Trust.

3. Suba os servicos:

```bash
docker compose up -d
```

4. Veja logs:

```bash
docker logs -f nightrun_evolution_api
```

5. Teste local no servidor:

```bash
curl http://127.0.0.1:8080
```

## Subir Com Postgres Local

Use isto apenas para teste local, sem Neon:

```bash
docker compose --env-file .env.local.example --profile local-db up -d redis postgres-local evolution-api
```

Esse modo usa o arquivo `.env.local.example`, com Postgres e Redis locais. Para parar:

```bash
docker compose --env-file .env.local.example --profile local-db down
```

## Configurar Cloudflare Tunnel

No Cloudflare Zero Trust:

1. Crie um tunnel para o servidor.
2. Adicione Public Hostname:
   - Hostname: `whatsapp.seu-dominio.com`
   - Service: `http://evolution-api:8080`
3. Copie o token do tunnel para `CLOUDFLARED_TOKEN`.

## Configurar O Worker

No `worker/wrangler.toml`, aponte:

```toml
EVOLUTION_URL = "https://whatsapp.seu-dominio.com"
INSTANCE_NAME = "mcu_nightrun_uba"
```

E mantenha a mesma chave:

```toml
EVOLUTION_API_KEY = "mesmo_valor_de_AUTHENTICATION_API_KEY"
```

Depois publique:

```bash
cd ../../worker
npx wrangler deploy
```

## Criar E Conectar A Instancia

Com o Worker publicado:

```bash
curl -X POST https://SEU_WORKER/whatsapp/create
curl https://SEU_WORKER/whatsapp/connect
```

O segundo comando retorna o QR Code para parear o WhatsApp.

## Observacoes

- A Evolution API deve ficar atras do Cloudflare Tunnel; a porta local esta presa em `127.0.0.1`.
- Nao exponha `:8080` diretamente na internet.
- Nao versione `.env`, connection string Neon ou token Cloudflare.
- O Worker continua como camada de API para o app, evitando expor a Evolution diretamente no frontend.
