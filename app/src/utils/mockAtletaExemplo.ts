// Dados fictícios usados apenas na pré-visualização do admin (comprovante de exemplo e
// perfil de atleta de exemplo) - nenhum dado real de inscrito. Sem fotoUrl de propósito:
// não há uma foto de rosto genérica segura pra usar aqui, então o comprovante e o
// dashboard caem no mesmo fallback (iniciais) que um atleta real sem foto cadastrada.
export const MOCK_ATLETA_REG: any = {
  id: 'exemplo-000',
  nome: 'Maria Exemplo da Silva',
  cpf: '123.456.789-00',
  dataNascimento: new Date(1995, 4, 20),
  sexo: 'F',
  telefone: '(33) 99999-0000',
  telefoneSecundario: '',
  email: 'maria.exemplo@email.com',
  categoria: 'adulto',
  paymentStatus: 'pago',
  amount: 11550,
  createdAt: new Date(2026, 7, 9, 14, 43),
  numeroInscricao: '78951971',
  kit: 'exemplo-kit',
  kitNome: 'Kit Único',
  tamanhoCamiseta: 'M',
  modalidadeId: 'exemplo-modalidade',
  integranteEquipe: 'sim',
  equipeNome: 'Margaridense Running',
  fotoUrl: '',
  euVouCardUrl: '',
  endereco: {
    cidade: 'Manhuaçu',
    uf: 'MG',
    bairro: 'Colina',
    rua: 'Rua Projetada',
    numero: '55',
    cep: '36913-000',
  },
  enderecoPreenchidoEm: new Date(2026, 7, 9, 13, 44),
  saude: {
    tipoSanguineo: 'O+',
    condicaoSaude: 'Nenhuma',
    alergiaDesc: 'Nenhuma',
    medicamentoDesc: 'Nenhum',
  },
  contatoEmergencia: {
    nome: 'João Exemplo',
    parentesco: 'Cônjuge',
    telefone: '(33) 98888-0000',
  },
  titularidadeRecebida: false,
  titularidadeRecebidaDeNome: '',
};

export const MOCK_MODALIDADE = {
  id: 'exemplo-modalidade',
  nome: 'Corrida 10km',
  distancia: '10km',
};

export const MOCK_CAMISETA_LABEL = 'M - Médio';
export const MOCK_KIT_NOME = 'Kit Único';
