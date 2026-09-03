import { normalizePhoneDigits } from './titularidadeUtils';

// Mesma lógica usada em AtletaDashboard.tsx para achar inscrições vinculadas a uma outra:
// mesmo e-mail, ou telefone que aparece como contato de emergência de um lado ou de outro.
const saoVinculadas = (a: any, b: any) => {
  const emailA = String(a.email || '').trim().toLowerCase();
  const emailB = String(b.email || '').trim().toLowerCase();
  const telA = normalizePhoneDigits(a.telefone);
  const telB = normalizePhoneDigits(b.telefone);
  const contatoTelA = normalizePhoneDigits(a.contatoEmergencia?.telefone);
  const contatoTelB = normalizePhoneDigits(b.contatoEmergencia?.telefone);

  const mesmoEmail = !!emailA && emailA === emailB;
  const aEhContatoDeB = !!telA && telA === contatoTelB;
  const bEhContatoDeA = !!telB && telB === contatoTelA;

  return mesmoEmail || aEhContatoDeB || bEhContatoDeA;
};

/** Agrupa uma lista de inscrições em grupos de "principal + vinculados", usando a mesma
 * regra do dashboard do atleta. Cada inscrição aparece em exatamente um grupo (a primeira
 * da lista original vira a principal do grupo). Só enxerga vínculos dentro da lista recebida
 * — não faz uma nova consulta ao Firestore. */
export function groupLinkedRegistrations<T extends { id: string }>(registrations: T[]): { main: T; linked: T[] }[] {
  const used = new Set<string>();
  const groups: { main: T; linked: T[] }[] = [];

  for (const reg of registrations) {
    if (used.has(reg.id)) continue;
    used.add(reg.id);
    const linked = registrations.filter(other => !used.has(other.id) && saoVinculadas(reg, other));
    linked.forEach(item => used.add(item.id));
    groups.push({ main: reg, linked });
  }

  return groups;
}
