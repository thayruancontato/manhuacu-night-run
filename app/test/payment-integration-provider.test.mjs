import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const publicForm = await readFile(new URL('../src/pages/PublicForm.tsx', import.meta.url), 'utf8');
const adminIntegracoes = await readFile(new URL('../src/pages/AdminIntegracoes.tsx', import.meta.url), 'utf8');

test('admin integrations can choose the payment provider', () => {
  assert.match(adminIntegracoes, /payment_integration/);
  assert.match(adminIntegracoes, /\/asaas-logo\.svg/);
  assert.match(adminIntegracoes, /\/cora-logo\.svg/);
  assert.match(adminIntegracoes, /setPaymentProvider\('asaas'\)/);
  assert.match(adminIntegracoes, /setPaymentProvider\('cora'\)/);
  assert.match(adminIntegracoes, /Salvar integração/);
});

test('public form creates payments with the selected provider', () => {
  assert.match(publicForm, /payment_integration/);
  assert.doesNotMatch(publicForm, /setPaymentProvider/);
  assert.match(publicForm, /paymentProvider === 'cora'/);
  assert.match(publicForm, /cora: 50/);
  assert.match(publicForm, /asaas: 200/);
  assert.match(publicForm, /PIX_PAYMENT_FEE_CENTS_BY_PROVIDER\[paymentProvider\]/);
  assert.match(publicForm, /\/cora\/invoices\/pix/);
  assert.match(publicForm, /QRCode\.toDataURL\(pixPayload\)/);
  assert.match(publicForm, /\/asaas\/customers/);
  assert.match(publicForm, /paymentExternalId/);
});
