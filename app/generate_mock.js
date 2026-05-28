import fs from 'fs';

const names = ['Gabriel', 'Lucas', 'Ana', 'Maria', 'Pedro', 'Julia', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fabio', 'Giovana', 'Hugo', 'Isabela', 'Jorge', 'Kelly', 'Luiz', 'Mariana', 'Natan', 'Olivia', 'Paulo', 'Quiteria', 'Ricardo', 'Sofia', 'Tiago', 'Ursula', 'Vitor', 'Wendel', 'Xavier', 'Yara', 'Zeca'];
const lastnames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas'];
const categorias = ['adulto', 'infantil'];
const tamanhos = ['M_PP', 'M_P', 'M_M', 'M_G', 'M_GG', 'M_EXGG', 'BL_PP', 'BL_P', 'BL_M', 'BL_G', 'BL_GG'];
const status = ['pago', 'pendente', 'vencido', 'cancelado'];

const mockData = [];

for (let i = 0; i < 500; i++) {
  const name = `${names[Math.floor(Math.random() * names.length)]} ${lastnames[Math.floor(Math.random() * lastnames.length)]} ${lastnames[Math.floor(Math.random() * lastnames.length)]}`;
  const cat = Math.random() > 0.15 ? 'adulto' : 'infantil';
  const size = tamanhos[Math.floor(Math.random() * tamanhos.length)];
  const payStatus = Math.random() > 0.3 ? 'pago' : 'pendente';
  const cpf = `${Math.floor(Math.random() * 900 + 100)}.${Math.floor(Math.random() * 900 + 100)}.${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 90 + 10)}`;
  
  mockData.push({
    nome: name,
    cpf: cpf,
    email: `${name.toLowerCase().replace(/ /g, '.')}@email.com`,
    telefone: `(32) 9${Math.floor(Math.random() * 9000 + 1000)}-${Math.floor(Math.random() * 9000 + 1000)}`,
    dataNascimento: cat === 'infantil' ? `201${Math.floor(Math.random() * 9)}-05-10` : `199${Math.floor(Math.random() * 9)}-05-10`,
    sexo: Math.random() > 0.5 ? 'M' : 'F',
    categoria: cat,
    tamanhoCamiseta: size,
    paymentStatus: payStatus,
    kit: 'unico',
    endereco: { 
      cep: '36500-000',
      rua: 'Rua de Teste',
      numero: Math.floor(Math.random() * 1000).toString(),
      bairro: 'Centro',
      cidade: 'Ubá', 
      uf: 'MG' 
    },
    createdAt: { seconds: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 1000000), nanoseconds: 0 }
  });
}

fs.writeFileSync('src/mock_registrations.json', JSON.stringify(mockData, null, 2));
console.log('Gerado 500 registros mock com sucesso!');
