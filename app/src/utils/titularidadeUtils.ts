// Mensagens de aviso de transferência de titularidade, compartilhadas entre o modal
// de transferência e o banner permanente na ficha do atleta (para reenvio posterior).

export const normalizePhoneDigits = (value: string) => String(value || '').replace(/\D/g, '');

export const buildWhatsAppUrl = (phone: string, text: string) => {
  const clean = normalizePhoneDigits(phone);
  const formatted = clean.startsWith('55') ? clean : `55${clean}`;
  return `https://wa.me/${formatted}?text=${encodeURIComponent(text)}`;
};

export const buildOldOwnerTransferMessage = (oldOwnerNome: string, newOwnerNome: string) => (
  `Olá ${String(oldOwnerNome || 'Atleta').split(' ')[0]}! Confirmamos a transferência da titularidade da sua inscrição ` +
  `na MCU Night Run 2026 para ${newOwnerNome || 'outro atleta'}.\n\n` +
  `Sua inscrição foi encerrada como parte desta transferência. Qualquer dúvida, é só responder por aqui.`
);

export const buildNewOwnerTransferMessage = (newOwnerNome: string, oldOwnerNome: string) => (
  `Olá ${String(newOwnerNome || 'Atleta').split(' ')[0]}! Sua inscrição na MCU Night Run 2026 foi CONFIRMADA através de uma ` +
  `transferência de titularidade feita por ${oldOwnerNome || 'outro atleta'}.\n\n` +
  `Você já está garantido(a) na corrida! Guarde esta mensagem como comprovante.`
);
