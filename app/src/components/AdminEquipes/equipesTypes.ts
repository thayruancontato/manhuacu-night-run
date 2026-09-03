export type EquipeOficial = {
  id: string;
  nome: string;
  normalizedNome: string;
  observacoes?: string;
  createdAt?: any;
  updatedAt?: any;
};

export type EquipeGroup = {
  key: string;
  nome: string;
  oficial: EquipeOficial | null;
  membros: any[];
};

// O sistema de equipes conta apenas inscritos confirmados (pago), então "total" já é
// o total de confirmados - pendente/cancelado nem entram na equipe.
export type EquipeStats = {
  total: number;
  arrecadado: number;
};
