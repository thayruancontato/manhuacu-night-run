// Monta a mensagem de confirmação de dados enviada ao inscrito.
// Regras do produto: bem estruturada, SEM emojis e com todos os dados em MAIÚSCULO.

const up = (value: any) => String(value ?? '').trim().toUpperCase();

const firstName = (nome: any) => up(String(nome ?? '').split(' ')[0] || 'ATLETA');

const sexoLabel = (sexo: any) => {
  const value = up(sexo);
  if (value === 'M' || value === 'MASCULINO') return 'MASCULINO';
  if (value === 'F' || value === 'FEMININO') return 'FEMININO';
  return value || '-';
};

const orDash = (value: string) => (value && value !== '-' ? value : '-');

export type ConfirmationLookups = {
  modalidadeNome?: string;
  kitNome?: string;
  camisetaLabel?: string;
};

export const buildDataConfirmationMessage = (registration: any, lookups: ConfirmationLookups = {}): string => {
  const endereco = registration.endereco || {};
  const emergencia = registration.contatoEmergencia || {};

  const linhaEndereco = orDash(up([
    [endereco.rua, endereco.numero].filter(Boolean).join(', '),
  ].filter(Boolean).join(' ')));
  const bairro = orDash(up(endereco.bairro));
  const cidadeUf = orDash(up([endereco.cidade, endereco.uf].filter(Boolean).join(' / ')));
  const cep = orDash(up(endereco.cep));

  const modalidade = orDash(up(lookups.modalidadeNome || registration.modalidadeNome));
  const kit = orDash(up(lookups.kitNome || registration.kit));
  const camiseta = orDash(up(lookups.camisetaLabel || registration.tamanhoCamiseta));
  const equipe = up(registration.integranteEquipe === 'sim' || registration.equipeNome ? registration.equipeNome : '');

  const linhas: string[] = [];
  linhas.push('CONFIRMAÇÃO DE DADOS - MCU NIGHT RUN 2026');
  linhas.push('');
  linhas.push(`OLÁ, ${firstName(registration.nome)}!`);
  linhas.push('CONFIRA ABAIXO OS DADOS DA SUA INSCRIÇÃO. SE ALGO ESTIVER INCORRETO, RESPONDA ESTA MENSAGEM PARA CORRIGIRMOS.');
  linhas.push('');
  linhas.push('--- DADOS PESSOAIS ---');
  linhas.push(`NOME: ${orDash(up(registration.nome))}`);
  linhas.push(`CPF: ${orDash(up(registration.cpf))}`);
  linhas.push(`NASCIMENTO: ${orDash(up(registration.dataNascimento))}`);
  linhas.push(`SEXO: ${sexoLabel(registration.sexo)}`);

  if (registration.responsavelNome) {
    linhas.push('');
    linhas.push('--- RESPONSAVEL ---');
    linhas.push(`NOME: ${orDash(up(registration.responsavelNome))}`);
    linhas.push(`CPF: ${orDash(up(registration.responsavelCpf))}`);
  }

  linhas.push('');
  linhas.push('--- CONTATO ---');
  linhas.push(`TELEFONE: ${orDash(up(registration.telefone))}`);
  linhas.push(`E-MAIL: ${orDash(up(registration.email))}`);

  const temEndereco = [linhaEndereco, bairro, cidadeUf, cep].some(value => value && value !== '-');
  if (temEndereco) {
    linhas.push('');
    linhas.push('--- ENDEREÇO ---');
    linhas.push(`LOGRADOURO: ${linhaEndereco}`);
    linhas.push(`BAIRRO: ${bairro}`);
    linhas.push(`CIDADE/UF: ${cidadeUf}`);
    linhas.push(`CEP: ${cep}`);
  }

  linhas.push('');
  linhas.push('--- INSCRIÇÃO ---');
  linhas.push(`CATEGORIA: ${orDash(up(registration.categoria))}`);
  linhas.push(`MODALIDADE: ${modalidade}`);
  linhas.push(`KIT: ${kit}`);
  linhas.push(`CAMISETA: ${camiseta}`);
  if (equipe) linhas.push(`EQUIPE: ${equipe}`);

  if (emergencia.nome || emergencia.telefone) {
    linhas.push('');
    linhas.push('--- CONTATO DE EMERGÊNCIA ---');
    linhas.push(`NOME: ${orDash(up(emergencia.nome))}`);
    linhas.push(`TELEFONE: ${orDash(up(emergencia.telefone))}`);
    if (emergencia.parentesco) linhas.push(`PARENTESCO: ${orDash(up(emergencia.parentesco))}`);
  }

  linhas.push('');
  linhas.push('CASO ESTEJA TUDO CERTO, NÃO É PRECISO FAZER NADA.');
  linhas.push('MCU NIGHT RUN 2026');

  return linhas.join('\n');
};
