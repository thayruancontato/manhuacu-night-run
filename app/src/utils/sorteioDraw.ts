import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { isRegistrationEligible, pickRandomUnbiased, type SorteioGanhador, type SorteioTipo } from './sorteioUtils';

export type DrawResult = {
  ganhadores: SorteioGanhador[];
  elegiveis: number;
};

/**
 * Executa o sorteio: monta o universo de elegíveis, escolhe de forma imparcial
 * e grava o resultado. Usado tanto pelo admin quanto pelo link do coordenador.
 */
export const runSorteio = async (sorteio: any): Promise<DrawResult> => {
  const tipo: SorteioTipo = sorteio.tipo === 'cupom' ? 'cupom' : 'geral';
  const quantidade = Math.max(1, Number(sorteio.quantidadeGanhadores || 1));

  const [regSnap, sorteiosSnap] = await Promise.all([
    getDocs(query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago'))),
    getDocs(collection(db, 'nightrun_sorteios')),
  ]);

  // Quem já ganhou outro sorteio não concorre de novo.
  const jaGanharam = new Set<string>();
  sorteiosSnap.docs.forEach(item => {
    if (item.id === sorteio.id) return;
    (item.data().ganhadorIds || []).forEach((id: string) => jaGanharam.add(String(id)));
  });

  const elegiveis = regSnap.docs.filter(item =>
    isRegistrationEligible(item.data(), tipo, sorteio.couponCode) && !jaGanharam.has(item.id)
  );

  if (elegiveis.length === 0) {
    throw new Error(
      tipo === 'cupom'
        ? `Nenhum inscrito elegível: ninguém pagou usando o cupom ${sorteio.couponCode || '-'} (ou todos já ganharam).`
        : 'Nenhum inscrito elegível: não há pagamentos confirmados disponíveis.'
    );
  }

  const escolhidos = pickRandomUnbiased(elegiveis, quantidade);
  const ganhadores: SorteioGanhador[] = escolhidos.map(item => {
    const data = item.data();
    return {
      registrationId: item.id,
      nome: data.nome || 'Atleta',
      telefone: data.telefone || '',
      fotoUrl: data.fotoUrl || '',
      visualizouEm: null,
      whatsappEnviadoEm: null,
      whatsappEnviosCount: 0,
    };
  });

  await updateDoc(doc(db, 'nightrun_sorteios', sorteio.id), {
    ganhadores,
    ganhadorIds: ganhadores.map(item => item.registrationId),
    totalElegiveis: elegiveis.length,
    sorteadoEm: new Date(),
    status: 'finalizado',
    updatedAt: new Date(),
  });

  return { ganhadores, elegiveis: elegiveis.length };
};

/** Conta quantas inscrições estão aptas a concorrer, para exibir antes do sorteio. */
export const countElegiveis = async (sorteio: any): Promise<number> => {
  const tipo: SorteioTipo = sorteio.tipo === 'cupom' ? 'cupom' : 'geral';
  const [regSnap, sorteiosSnap] = await Promise.all([
    getDocs(query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago'))),
    getDocs(collection(db, 'nightrun_sorteios')),
  ]);
  const jaGanharam = new Set<string>();
  sorteiosSnap.docs.forEach(item => {
    if (item.id === sorteio.id) return;
    (item.data().ganhadorIds || []).forEach((id: string) => jaGanharam.add(String(id)));
  });
  return regSnap.docs.filter(item =>
    isRegistrationEligible(item.data(), tipo, sorteio.couponCode) && !jaGanharam.has(item.id)
  ).length;
};
