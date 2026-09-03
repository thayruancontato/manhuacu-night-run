import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export type KitRecord = {
  id: string;
  nome: string;
  descricao: string;
  itens: string[];
  ativo: boolean;
  precoForcado: boolean;
  precoForcadoValor: number;
  isPadrao: boolean;
  createdAt?: any;
};

export const DEFAULT_KIT_ID = 'unico';

// O kit padrão sempre existe (id fixo 'unico', igual ao valor histórico gravado nas inscrições
// antes desse sistema de kits existir) - se a coleção nightrun_kits ainda não tem nenhum
// documento marcado isPadrao, é porque o admin nunca abriu a aba Kits: nesse caso devolvemos
// um registro-fallback só em memória, sem gravar nada. Quem grava de fato é AdminKits ao montar.
const FALLBACK_DEFAULT_KIT: KitRecord = {
  id: DEFAULT_KIT_ID,
  nome: 'Kit Único',
  descricao: 'Camiseta oficial + Medalha + Número de peito',
  itens: ['Camiseta Oficial', 'Medalha de Participação', 'Número de Peito', 'Chip de Cronometragem'],
  ativo: true,
  precoForcado: false,
  precoForcadoValor: 0,
  isPadrao: true,
};

export async function fetchKits(): Promise<KitRecord[]> {
  const snap = await getDocs(collection(db, 'nightrun_kits'));
  const list = snap.docs.map(d => ({
    id: d.id,
    nome: d.data().nome || '',
    descricao: d.data().descricao || '',
    itens: Array.isArray(d.data().itens) ? d.data().itens : [],
    ativo: !!d.data().ativo,
    precoForcado: !!d.data().precoForcado,
    precoForcadoValor: Number(d.data().precoForcadoValor || 0),
    isPadrao: !!d.data().isPadrao,
    createdAt: d.data().createdAt,
  } as KitRecord));
  if (!list.some(k => k.isPadrao)) list.push(FALLBACK_DEFAULT_KIT);
  return list;
}

// Resolve o nome ATUAL do kit (nunca um nome congelado no momento da inscrição) - se o kit
// tiver sido renomeado depois, quem chamar isso já vê o nome novo. registro sem `kit` salvo
// (inscrições antigas, antes desse sistema existir) cai no kit padrão.
export function resolveKitNome(kits: KitRecord[], kitId: string | undefined | null, fallbackNome?: string): string {
  if (!kitId) return kits.find(k => k.isPadrao)?.nome || fallbackNome || FALLBACK_DEFAULT_KIT.nome;
  return kits.find(k => k.id === kitId)?.nome || fallbackNome || kitId;
}
