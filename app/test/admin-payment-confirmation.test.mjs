import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const detailsSource = await readFile(new URL('../src/pages/AdminAtletaDetalhes.tsx', import.meta.url), 'utf8');

test('athlete details manual payment confirmation uses the worker notification flow', () => {
  assert.match(detailsSource, /VITE_WORKER_URL/);
  assert.match(detailsSource, /\/registrations\/\$\{encodeURIComponent\(id!\)\}\/confirm-payment/);
  assert.match(detailsSource, /forceNotify: true/);
  assert.match(detailsSource, /Pagamento confirmado e mensagem enviada/);
});
