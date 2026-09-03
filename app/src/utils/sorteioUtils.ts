export type SorteioStatus = 'agendado' | 'acontecendo' | 'finalizado';
export type SorteioTipo = 'geral' | 'cupom';

export type SorteioGanhador = {
  registrationId: string;
  nome: string;
  telefone: string;
  fotoUrl: string;
  visualizouEm?: any;
  whatsappEnviadoEm?: any;
  whatsappEnviosCount?: number;
};

export const SORTEIO_STATUS: { id: SorteioStatus; label: string; color: string }[] = [
  { id: 'agendado', label: 'Agendado', color: '#64748b' },
  { id: 'acontecendo', label: 'Acontecendo', color: '#f59e0b' },
  { id: 'finalizado', label: 'Finalizado', color: '#16a34a' },
];

export const sorteioStatusInfo = (status?: string) =>
  SORTEIO_STATUS.find(item => item.id === status) || SORTEIO_STATUS[0];

export const buildSorteioPublicUrl = (sorteioId: string) =>
  `${window.location.origin}/sorteio/${sorteioId}`;

export const buildSorteioOperatorUrl = (sorteioId: string, token: string) =>
  `${window.location.origin}/sorteio/${sorteioId}/operar?token=${token}`;

/** Token longo e imprevisível para o link do coordenador. */
export const generateOperatorToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Sorteio imparcial: embaralhamento Fisher-Yates usando crypto.getRandomValues
 * com rejeição de amostragem, evitando o viés do módulo que `Math.random()` mascara.
 */
const randomBelow = (limit: number) => {
  if (limit <= 0) return 0;
  const max = Math.floor(0xffffffff / limit) * limit;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= max);
  return value % limit;
};

export const pickRandomUnbiased = <T,>(items: T[], quantity: number): T[] => {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, Math.min(quantity, pool.length)));
};

export const normalizeWhatsAppPhone = (phone: string) => {
  const clean = String(phone || '').replace(/\D/g, '');
  return clean.startsWith('55') ? clean : `55${clean}`;
};

export const normalizeCouponCode = (value: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

/** Ganhadores no formato de array, tolerando o formato antigo de ganhador único. */
export const readGanhadores = (sorteio: any): SorteioGanhador[] => {
  if (Array.isArray(sorteio?.ganhadores) && sorteio.ganhadores.length) return sorteio.ganhadores;
  if (sorteio?.ganhadorRegistrationId) {
    return [{
      registrationId: sorteio.ganhadorRegistrationId,
      nome: sorteio.ganhadorNome || 'Atleta',
      telefone: sorteio.ganhadorTelefone || '',
      fotoUrl: sorteio.ganhadorFotoUrl || '',
      visualizouEm: sorteio.ganhadorVisualizouEm || null,
    }];
  }
  return [];
};

/** Inscrições elegíveis: pagas e, quando o sorteio é por cupom, que usaram aquele cupom. */
export const isRegistrationEligible = (registration: any, tipo: SorteioTipo, couponCode: string) => {
  if (registration.paymentStatus !== 'pago') return false;
  if (tipo !== 'cupom') return true;
  return normalizeCouponCode(registration.couponCode) === normalizeCouponCode(couponCode);
};

export const buildWinnerWhatsAppText = (sorteio: any, ganhador: SorteioGanhador) => {
  const primeiroNome = String(ganhador.nome || 'Atleta').split(' ')[0] || 'Atleta';
  const premio = sorteio.premioNome || 'um prêmio';
  const titulo = sorteio.titulo || 'Sorteio MCU Night Run 2026';

  return `PARABENS, ${primeiroNome.toUpperCase()}! Voce ganhou!\n\n` +
    `Voce foi sorteado(a) no ${titulo} da MCU Night Run 2026.\n\n` +
    `Seu premio: ${premio}\n\n` +
    `${sorteio.descricao ? `${sorteio.descricao}\n\n` : ''}` +
    `Acompanhe o resultado na pagina do sorteio:\n${buildSorteioPublicUrl(sorteio.id)}\n\n` +
    `Responda esta mensagem para combinarmos a retirada do seu premio.`;
};
