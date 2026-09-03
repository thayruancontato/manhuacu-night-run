import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const menuSource = await readFile(new URL('../src/config/menu.ts', import.meta.url), 'utf8');
const invoicesSource = await readFile(new URL('../src/pages/AdminFaturas.tsx', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../../worker/src/index.js', import.meta.url), 'utf8');

test('finance menu and router expose the invoices page', () => {
  assert.match(menuSource, /\/admin\/financeiro\/faturas/);
  assert.match(appSource, /path="financeiro\/faturas"/);
  assert.match(appSource, /AdminFaturas/);
});

test('invoices page has bank tabs and open/delete actions', () => {
  assert.match(invoicesSource, /id: 'cora'/);
  assert.match(invoicesSource, /id: 'asaas'/);
  assert.match(invoicesSource, /Abrir fatura/);
  assert.match(invoicesSource, /Excluir fatura/);
  assert.match(invoicesSource, /method: 'DELETE'/);
  assert.match(invoicesSource, /loadRegistrationInvoices/);
  assert.match(invoicesSource, /res\.status === 404/);
  assert.match(invoicesSource, /Exibindo as faturas vinculadas às inscrições/);
  assert.match(invoicesSource, /Verificar faturas/);
  assert.match(invoicesSource, /bank-invoices\/asaas\/reconcile-paid/);
  assert.match(invoicesSource, /Aplicar correcao/);
  assert.match(invoicesSource, /Pagas no Asaas/);
  assert.match(invoicesSource, /bank-invoices\/asaas\/reconcile-system-pending/);
  assert.match(invoicesSource, /Confirmar todas/);
  assert.match(invoicesSource, /Enviar card Eu Vou/);
  assert.match(invoicesSource, /send-payment-card/);
  assert.match(invoicesSource, /Selecionar vencidas/);
  assert.match(invoicesSource, /delete-bulk/);
  assert.match(invoicesSource, /Isso nao apaga inscricoes do sistema/);
  assert.match(invoicesSource, /Limpar pendentes/);
  assert.match(invoicesSource, /cleanup-registrations/);
  assert.match(invoicesSource, /Apaga fatura \+ cadastro/);
  assert.match(invoicesSource, /Apagar selecionados/);
});

test('worker lists all invoice pages and supports deletion for both banks', () => {
  assert.match(workerSource, /path === "\/bank-invoices"/);
  assert.match(workerSource, /getAsaasInvoices/);
  assert.match(workerSource, /getCoraInvoices/);
  assert.match(workerSource, /deleteAsaasInvoice/);
  assert.match(workerSource, /deleteCoraInvoice/);
  assert.match(workerSource, /data\.hasMore/);
});
