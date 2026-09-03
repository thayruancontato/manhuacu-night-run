import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workerSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const wranglerConfig = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('Cora production endpoint is configured without committing secrets', () => {
  assert.match(wranglerConfig, /CORA_BASE_URL\s*=\s*"https:\/\/matls-clients\.api\.cora\.com\.br"/);
  assert.match(wranglerConfig, /CORA_AUTH_MODE\s*=\s*"direct"/);
  assert.equal(wranglerConfig.includes('CORA_CLIENT_ID ='), false);
  assert.equal(wranglerConfig.includes('CORA_CLIENT_SECRET ='), false);
  assert.equal(wranglerConfig.includes('CORA_WEBHOOK_SECRET ='), false);
  assert.match(wranglerConfig, /binding\s*=\s*"CORA_MTLS"/);
});

test('worker supports Cora Pix invoices and webhook confirmation', () => {
  assert.match(workerSource, /path === "\/cora\/invoices\/pix"/);
  assert.match(workerSource, /createCoraPixInvoice/);
  assert.match(workerSource, /payment_forms: \["PIX"\]/);
  assert.match(workerSource, /data\.pix\?\.emv/);
  assert.match(workerSource, /isCoraCipRegistrationError/);
  assert.match(workerSource, /bank slip not registered in cip/);
  assert.match(workerSource, /path === "\/cora\/webhook"/);
  assert.match(workerSource, /CORA_WEBHOOK_SECRET/);
  assert.match(workerSource, /webhook-event-type/);
  assert.match(workerSource, /webhook-resource-id/);
  assert.match(workerSource, /bodyText \? JSON\.parse\(bodyText\) : \{\}/);
  assert.match(workerSource, /searchFields: \["coraInvoiceId", "coraInvoiceCode", "paymentExternalId"\]/);
});

test('worker exposes webhook diagnostics for admin tests', () => {
  assert.match(workerSource, /path === "\/webhooks\/test"/);
  assert.match(workerSource, /testWebhookIntegration/);
  assert.match(workerSource, /ASAAS_WEBHOOK_SECRET/);
  assert.match(workerSource, /CORA_WEBHOOK_SECRET/);
  assert.match(workerSource, /webhookUrl/);
});

test('worker supports manual payment confirmation with WhatsApp notification', () => {
  assert.equal(workerSource.includes('/confirm-payment'), true);
  assert.match(workerSource, /confirmRegistrationPaymentById/);
  assert.match(workerSource, /confirmRegistrationDocument/);
  assert.match(workerSource, /forceNotify: true/);
  assert.match(workerSource, /buildPaymentConfirmationText/);
  assert.match(workerSource, /type: "payment_confirmation"/);
  assert.match(workerSource, /paymentConfirmationWhatsAppSentAt/);
  assert.match(workerSource, /getPaymentConfirmationWhatsAppConfig/);
  assert.match(workerSource, /instanceName: whatsappConfig\.instanceName/);
  assert.match(workerSource, /fallback: "image_required"/);
  assert.match(workerSource, /WHATSAPP_CONFIRMATION_MAX_ATTEMPTS/);
});

test('worker reconciles local paid registrations with pending Asaas invoices', () => {
  assert.match(workerSource, /\/bank-invoices\/asaas\/reconcile-paid/);
  assert.match(workerSource, /reconcilePaidAsaasInvoices/);
  assert.match(workerSource, /receiveInCash/);
  assert.match(workerSource, /notifyCustomer: false/);
  assert.match(workerSource, /paymentStatus === "pago"/);
});

test('worker reconciles Asaas paid invoices with local pending registrations', () => {
  assert.match(workerSource, /\/bank-invoices\/asaas\/reconcile-system-pending/);
  assert.match(workerSource, /reconcileAsaasPaidSystemPending/);
  assert.match(workerSource, /skipNotify: true/);
  assert.match(workerSource, /\/send-payment-card/);
  assert.match(workerSource, /sendRegistrationPaymentCardById/);
});

test('worker deletes overdue Asaas invoices in bulk without touching registrations', () => {
  assert.match(workerSource, /\/bank-invoices\/asaas\/delete-bulk/);
  assert.match(workerSource, /deleteAsaasInvoicesBulk/);
  assert.match(workerSource, /deleteAsaasInvoice/);
});

test('worker can clean pending Asaas registrations by deleting invoice and registration', () => {
  assert.match(workerSource, /\/bank-invoices\/asaas\/cleanup-registrations/);
  assert.match(workerSource, /cleanupPendingAsaasRegistrations/);
  assert.match(workerSource, /deleteFirestoreDocument/);
  assert.match(workerSource, /invoice_already_missing/);
});

test('worker exposes Asaas confirmed credit card amounts not yet credited', () => {
  assert.match(workerSource, /getAsaasCreditCardPendingCredit/);
  assert.match(workerSource, /requestUrl\.searchParams\.set\("status", "CONFIRMED"\)/);
  assert.match(workerSource, /requestUrl\.searchParams\.set\("billingType", "CREDIT_CARD"\)/);
  assert.match(workerSource, /pendingCredit/);
  assert.match(workerSource, /amountCents/);
  assert.match(workerSource, /estimatedCreditDate/);
});

test('Cora direct mode uses the mTLS fetch binding when available', () => {
  assert.match(workerSource, /env\.CORA_MTLS\?\.fetch/);
  assert.match(workerSource, /env\.CORA_MTLS/);
  assert.match(workerSource, /\/token/);
  assert.match(workerSource, /grant_type: "client_credentials"/);
});
