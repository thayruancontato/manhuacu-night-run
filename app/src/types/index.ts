export interface Modalidade {
  id: string;
  nome: string;
  distancia: string;
  categoria: 'adulto' | 'infantil';
  anosNascimento: number[];
  idadeMin: number;
  idadeMax: number;
  ativo: boolean;
}

export interface Registration {
  id: string;
  nome: string;
  cpf: string;
  dataNascimento: string;
  responsavelNome: string;
  responsavelCpf: string;
  sexo: string;
  email: string;
  telefone: string;
  telefoneSecundario: string;
  endereco: {
    cep: string; rua: string; numero: string; bairro: string; cidade: string; uf: string;
  };
  categoria: 'adulto' | 'infantil';
  modalidadeId: string;
  kit: 'unico' | 'premium' | 'vip';
  tamanhoCamiseta: string;
  saude: {
    temAlergia: boolean; alergiaDesc: string;
    tomaMedicamento: boolean; medicamentoDesc: string;
    condicaoSaude: string; tipoSanguineo: string;
    autorizadoAtividades: boolean;
  };
  fotoUrl: string;
  contatoEmergencia: { nome: string; telefone: string; parentesco: string; };
  paymentStatus: 'pendente' | 'pago' | 'vencido' | 'cancelado';
  paymentProvider: 'asaas' | 'cora';
  paymentCustomerId: string;
  paymentExternalId: string;
  asaasCustomerId: string;
  asaasPaymentId: string;
  coraInvoiceId: string;
  coraInvoiceCode: string;
  invoiceUrl: string;
  contractStatus: 'pendente' | 'confirmado';
  createdAt: any;
  updatedAt: any;
}

export interface Kit {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  itens: string[];
}

export interface WhatsAppMessage {
  phone: string;
  text: string;
  imageUrl: string;
  alunoNome: string;
}

export const KITS: Kit[] = [
  { id: 'unico', nome: 'Kit Único', descricao: 'Camiseta oficial + Medalha + Número de peito', preco: 9500, itens: ['Camiseta Oficial', 'Medalha de Participação', 'Número de Peito', 'Chip de Cronometragem'] },
];

export const CATEGORIAS = [
  { id: 'adulto', nome: 'ADULTO / ADOLESCENTE', descricao: 'Inscrição para adultos e adolescentes (Corrida ou Caminhada)' },
  { id: 'infantil', nome: 'INFANTIL (até 12 anos)', descricao: 'Inscrição especial para crianças' },
];

export const TAMANHOS_CAMISETA: Array<{ id: string; label: string; tipo: string; categoria?: 'adulto' | 'infantil' | 'todos'; medidas?: { largura: number; altura: number } }> = [
  { id: 'M_PP', label: 'Padrão - PP', tipo: 'Padrão' },
  { id: 'M_P', label: 'Padrão - P', tipo: 'Padrão' },
  { id: 'M_M', label: 'Padrão - M', tipo: 'Padrão' },
  { id: 'M_G', label: 'Padrão - G', tipo: 'Padrão' },
  { id: 'M_GG', label: 'Padrão - GG', tipo: 'Padrão' },
  { id: 'M_EXGG', label: 'Padrão - EXGG', tipo: 'Padrão' },
  { id: 'BL_PP', label: 'Baby Look - PP', tipo: 'Baby Look' },
  { id: 'BL_P', label: 'Baby Look - P', tipo: 'Baby Look' },
  { id: 'BL_M', label: 'Baby Look - M', tipo: 'Baby Look' },
  { id: 'BL_G', label: 'Baby Look - G', tipo: 'Baby Look' },
  { id: 'BL_GG', label: 'Baby Look - GG', tipo: 'Baby Look' },
];
