import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workerSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const wranglerConfig = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('Asaas worker is configured for production', () => {
  assert.match(wranglerConfig, /ASAAS_BASE_URL\s*=\s*"https:\/\/api\.asaas\.com\/v3"/);
  assert.equal(wranglerConfig.includes('api-sandbox.asaas.com'), false);
  assert.equal(wranglerConfig.includes('sandbox.asaas.com'), false);
  assert.equal(wranglerConfig.includes('$aact_hmlg_'), false);
});

test('production secrets are not committed in wrangler config', () => {
  assert.equal(wranglerConfig.includes('ASAAS_API_KEY ='), false);
  assert.equal(wranglerConfig.includes('ASAAS_WEBHOOK_SECRET ='), false);
  assert.equal(wranglerConfig.includes('EVOLUTION_API_KEY ='), false);
  assert.equal(wranglerConfig.includes('$aact_prod_'), false);
  assert.equal(wranglerConfig.includes('whsec_'), false);
});

test('sandbox payment simulation endpoint is blocked in production', () => {
  assert.match(workerSource, /path\.endsWith\("\/simulate"\)/);
  assert.match(workerSource, /Endpoint indisponivel em producao\./);
  assert.match(workerSource, /return json\(\{ error: "Endpoint indisponivel em producao\." \}, 404\)/);
  assert.equal(workerSource.includes('/sandbox/payment/'), false);
  assert.equal(workerSource.includes('[Asaas Simulate]'), false);
});

test('Asaas webhook validates the configured token header', () => {
  assert.match(workerSource, /request\.headers\.get\("asaas-access-token"\)/);
  assert.match(workerSource, /request\.headers\.get\("asaas-signature"\)/);
  assert.match(workerSource, /webhookToken !== env\.ASAAS_WEBHOOK_SECRET/);
  assert.match(workerSource, /Invalid signature/);
});
