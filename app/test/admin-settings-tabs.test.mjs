import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const menuSource = await readFile(new URL('../src/config/menu.ts', import.meta.url), 'utf8');
const adminLayout = await readFile(new URL('../src/layouts/AdminLayout.tsx', import.meta.url), 'utf8');
const adminCss = await readFile(new URL('../src/styles/admin.css', import.meta.url), 'utf8');
const adminSettings = await readFile(new URL('../src/pages/AdminSettings.tsx', import.meta.url), 'utf8');
const adminIntegracoes = await readFile(new URL('../src/pages/AdminIntegracoes.tsx', import.meta.url), 'utf8');
const adminModoManutencao = await readFile(new URL('../src/pages/AdminModoManutencao.tsx', import.meta.url), 'utf8');

test('integrations and maintenance mode are main admin sidebar options', () => {
  assert.match(menuSource, /\/admin\/integracoes/);
  assert.match(menuSource, /Integrações/);
  assert.match(menuSource, /\/admin\/modo-manutencao/);
  assert.match(menuSource, /Modo manutenção/);
  assert.match(appSource, /path="integracoes"/);
  assert.match(appSource, /path="modo-manutencao"/);
});

test('admin sidebar shows the active bank logo beside integrations', () => {
  assert.match(adminLayout, /onSnapshot/);
  assert.match(adminLayout, /payment_integration/);
  assert.match(adminLayout, /\/asaas-logo\.svg/);
  assert.match(adminLayout, /\/cora-logo\.svg/);
  assert.match(adminLayout, /item\.path === '\/admin\/integracoes'/);
  assert.match(adminLayout, /nav-active-bank-divider/);
  assert.match(adminLayout, /<small>Atual<\/small>/);
  assert.match(adminCss, /\.adm-nav-item \.nav-bank-logo/);
  assert.match(adminCss, /\.adm-nav-item \.nav-active-bank-divider/);
});

test('admin settings no longer owns integrations and maintenance mode tabs', () => {
  assert.doesNotMatch(adminSettings, /payment_integration/);
  assert.doesNotMatch(adminSettings, /site_maintenance/);
  assert.doesNotMatch(adminSettings, /settings-tabs-side/);
});

test('maintenance mode page controls the closed registrations screen', () => {
  assert.match(adminModoManutencao, /site_maintenance/);
  assert.match(adminModoManutencao, /registrationsClosed/);
  assert.match(adminModoManutencao, /settings-switch/);
  assert.match(adminModoManutencao, /Tela de inscrições indisponíveis/);
});

test('integrations page has an internal webhook test tab', () => {
  assert.match(adminIntegracoes, /activeIntegrationTab/);
  assert.match(adminIntegracoes, /webhookTestProvider/);
  assert.match(adminIntegracoes, /\/webhooks\/test/);
  assert.match(adminIntegracoes, /Testar webhook/);
  assert.match(adminIntegracoes, /Banco para testar/);
});
