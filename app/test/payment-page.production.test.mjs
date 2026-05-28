import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const paymentPageSource = await readFile(new URL('../src/pages/PaymentPage.tsx', import.meta.url), 'utf8');

test('payment page does not expose the sandbox payment simulation action', () => {
  assert.equal(paymentPageSource.includes('SIMULAR PAGAMENTO'), false);
  assert.equal(paymentPageSource.includes('btn-simulate-pro'), false);
  assert.equal(paymentPageSource.includes('/simulate'), false);
  assert.equal(paymentPageSource.includes('simulate:'), false);
});

test('payment page keeps only production payment actions visible', () => {
  assert.match(paymentPageSource, /COPIAR C[^\n]*DIGO PIX/);
  assert.match(paymentPageSource, /VER FATURA \/ OUTROS/);
});

test('payment page shows the PIX fee with low emphasis', () => {
  assert.match(paymentPageSource, /Taxa PIX:/);
  assert.match(paymentPageSource, /data\.paymentFee/);
});

test('payment page does not show bank logos in the PIX amount block', () => {
  assert.doesNotMatch(paymentPageSource, /\/asaas-logo\.svg/);
  assert.doesNotMatch(paymentPageSource, /\/cora-logo\.svg/);
});
