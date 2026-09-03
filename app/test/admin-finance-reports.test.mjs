import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const menuSource = await readFile(new URL('../src/config/menu.ts', import.meta.url), 'utf8');
const financeSource = await readFile(new URL('../src/pages/AdminFinanceiro.tsx', import.meta.url), 'utf8');
const reportsSource = await readFile(new URL('../src/pages/AdminFinanceiroRelatorios.tsx', import.meta.url), 'utf8');
const appCss = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');

test('finance reports page is reachable from routes and menu', () => {
  assert.match(appSource, /AdminFinanceiroRelatorios/);
  assert.match(appSource, /path="financeiro\/relatorios"/);
  assert.match(menuSource, /\/admin\/financeiro\/relatorios/);
  assert.match(financeSource, /\/admin\/financeiro\/relatorios/);
});

test('finance overview prioritizes grouped metric cards', () => {
  assert.match(financeSource, /finance-summary-card-grid/);
  assert.match(financeSource, /finance-summary-card/);
  assert.match(financeSource, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(220px, 1fr\)\)'/);
  assert.match(financeSource, /Receita Total/);
  assert.match(financeSource, /Recebido/);
  assert.match(financeSource, /Pendente/);
  assert.match(financeSource, /Cancelado/);
  assert.match(financeSource, /Confirmado no sistema/);
  assert.match(financeSource, /Cartao confirmado a creditar no Asaas/);
  assert.match(financeSource, /pagamento\(s\) direto do Asaas/);
});

test('finance reports page lets admin choose report sections and generate report', () => {
  assert.match(reportsSource, /reportOptions/);
  assert.match(reportsSource, /Resumo executivo/);
  assert.match(reportsSource, /Saldo atual das contas/);
  assert.match(reportsSource, /Cartao confirmado a creditar no Asaas/);
  assert.match(reportsSource, /Camisetas por tamanho/);
  assert.match(reportsSource, /Quantidade de camisetas por tamanho/);
  assert.match(reportsSource, /Equipes/);
  assert.match(reportsSource, /Historico completo de entradas bancarias/);
  assert.match(reportsSource, /Historico completo de saidas bancarias/);
  assert.match(reportsSource, /Tipos de pagamento/);
  assert.match(reportsSource, /Confirmar e gerar/);
  assert.match(reportsSource, /Imprimir \/ PDF/);
  assert.equal(reportsSource.includes('Resumo por kit/modalidade'), false);
  assert.equal(reportsSource.includes("key: 'kits'"), false);
  assert.equal(/estimad/i.test(reportsSource), false);
});

test('finance reports show Asaas pending card credit inside balance card', () => {
  assert.match(reportsSource, /pendingCredit=\{report\.balances\?\.asaas\?\.pendingCredit\}/);
  assert.match(reportsSource, /pendingCredit\?: any/);
  assert.match(reportsSource, /pendingCredit\?\.amountCents/);
  assert.match(reportsSource, /pendingCredit\?\.count/);
  assert.match(reportsSource, /valor liquido direto do Asaas/);
});

test('finance reports include shirt size table using shirt page logic', () => {
  assert.match(reportsSource, /TAMANHOS_CAMISETA/);
  assert.match(reportsSource, /findCamisetaByValue/);
  assert.match(reportsSource, /formatCamisetaLabel/);
  assert.match(reportsSource, /buildShirtRows/);
  assert.match(reportsSource, /item\.tamanhoCamiseta/);
  assert.match(reportsSource, /item\.camisaSeparada/);
  assert.match(reportsSource, /sort\(\(a, b\) => b\.participationValue - a\.participationValue/);
  assert.match(reportsSource, /headers=\{\['Tamanho', 'Tipo', 'Solicitado', 'Separado', 'Pendente', 'Participacao'\]\}/);
  assert.ok(reportsSource.indexOf("ShirtSizeTable") < reportsSource.indexOf('Historico completo de entradas'));
});

test('finance reports include team table below shirt table', () => {
  assert.match(reportsSource, /key: 'teams'/);
  assert.match(reportsSource, /buildTeamRows/);
  assert.match(reportsSource, /registration\.integranteEquipe !== 'sim'/);
  assert.match(reportsSource, /registration\.equipeNome/);
  assert.match(reportsSource, /teamLogoOf/);
  assert.match(reportsSource, /equipeLogoUrl/);
  assert.match(reportsSource, /logoEquipeUrl/);
  assert.match(reportsSource, /finance-report-team-grid/);
  assert.match(reportsSource, /finance-report-team-card/);
  assert.match(reportsSource, /width: row\.participation/);
  assert.ok(reportsSource.indexOf('<ShirtSizeTable rows={model.shirtCounts} />') < reportsSource.indexOf('<TeamTable rows={model.teamRows} />'));
  assert.ok(reportsSource.indexOf('<TeamTable rows={model.teamRows} />') < reportsSource.indexOf('Historico completo de entradas bancarias'));
});

test('finance reports use semantic colors for financial meaning', () => {
  assert.match(reportsSource, /income: \{ color: '#15803d'/);
  assert.match(reportsSource, /expense: \{ color: '#b91c1c'/);
  assert.match(reportsSource, /pending: \{ color: '#b45309'/);
  assert.match(reportsSource, /rowTones=\{rows\.map\(item => item\.type === 'saida' \? 'expense' : 'income'\)\}/);
  assert.match(reportsSource, /\$\{item\.type === 'saida' \? '-' : '\+'\}/);
});

test('finance reports payment method and provider charts only count paid registrations', () => {
  assert.match(reportsSource, /const byMethod = groupStats\(paid, paymentMethodOf\)/);
  assert.match(reportsSource, /const byProvider = groupStats\(paid, item => providerOf\(item\) === 'cora' \? 'Cora' : 'Asaas'\)/);
  assert.match(reportsSource, /<ChartSection title="Tipos de pagamento" data=\{model\.byMethod\} total=\{model\.paidTotal\}/);
  assert.match(reportsSource, /<ChartSection title="Distribuicao por banco" data=\{model\.byProvider\} total=\{model\.paidTotal\}/);
});

test('finance reports entries and exits tables use real bank movements from both banks', () => {
  assert.match(reportsSource, /const bankEntries = bankItems/);
  assert.match(reportsSource, /const bankExits = bankItems/);
  assert.match(reportsSource, /filter\(item => item\.type === 'entrada'\)/);
  assert.match(reportsSource, /filter\(item => item\.type === 'saida'\)/);
  assert.match(reportsSource, /entries: bankEntries/);
  assert.match(reportsSource, /exits: bankExits/);
  assert.match(reportsSource, /<FeesSection entries=\{model\.systemEntries\} exits=\{model\.feeExits\}/);
  assert.match(reportsSource, /<MovementTable title="Historico completo de entradas bancarias" rows=\{model\.entries\}/);
  assert.match(reportsSource, /<MovementTable title="Historico completo de saidas bancarias" rows=\{model\.exits\}/);
});

test('finance reports print view uses A4 layout and hides controls', () => {
  assert.match(reportsSource, /className="finance-report-controls no-print"/);
  assert.match(reportsSource, /className="finance-report-document"/);
  assert.match(reportsSource, /className="finance-report-table"/);
  assert.match(appCss, /size:\s*A4 portrait/);
  assert.match(appCss, /body:has\(\.finance-report-page\) \.adm-mobile-header/);
  assert.match(appCss, /\.finance-report-document\s*\{[\s\S]*width:\s*100% !important/);
  assert.match(appCss, /\.finance-report-document\s*\{[\s\S]*max-width:\s*none !important/);
  assert.match(appCss, /\.finance-report-section\s*\{[\s\S]*padding:\s*5mm 4mm !important/);
  assert.match(appCss, /\.finance-report-team-grid/);
  assert.match(appCss, /\.finance-report-team-card/);
  assert.match(appCss, /\.finance-report-table thead/);
  assert.match(appCss, /\.finance-report-table tr/);
});
