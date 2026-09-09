// Erros técnicos do Firebase (ex: "Quota exceeded" quando a cota de leituras do Firestore
// estoura) nunca devem aparecer crus pro usuário final - passam por aqui antes de qualquer
// showAlert/alert nas telas públicas/do atleta, trocando por uma mensagem neutra que só
// pede pra tentar mais tarde, sem citar cota, sobrecarga ou qualquer detalhe do sistema.
const QUOTA_ERROR_RE = /quota|resource-exhausted|429|firestore_error/i;

export function getFriendlyErrorMessage(err: any, fallback: string): string {
  const raw = String(err?.message || err?.code || err || '');
  if (QUOTA_ERROR_RE.test(raw)) {
    return 'Por favor, tenha paciência e tente novamente em algumas horas.';
  }
  return fallback;
}
