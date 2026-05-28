import { collection, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export async function seedKitsAndShirts() {
  const kitItems = [
    { id: 'camiseta', nome: 'CAMISETA', descricao: 'Tecido tecnológico e confortável', icone: 'Shirt' },
    { id: 'sacochila', nome: 'SACOCHILA', descricao: 'Leve seus itens com praticidade', icone: 'ShoppingBag' },
    { id: 'medalha', nome: 'MEDALHA', descricao: 'Sua conquista muito bem merecida', icone: 'Award' },
    { id: 'bone', nome: 'BONÉ EXCLUSIVO', descricao: 'Proteção e estilo para sua corrida', icone: 'Zap' },
    { id: 'copo', nome: 'COPO', descricao: 'Hidrate-se durante todo o percurso', icone: 'CupSoda' },
    { id: 'meia', nome: 'MEIA ESPORTIVA', descricao: 'Mais conforto e desempenho', icone: 'Footprints' },
  ];

  const shirtSizes = [
    { id: 'P', label: 'Padrão - P', estoque: 50, ativo: true, tipo: 'Padrão' },
    { id: 'M', label: 'Padrão - M', estoque: 50, ativo: true, tipo: 'Padrão' },
    { id: 'G', label: 'Padrão - G', estoque: 50, ativo: true, tipo: 'Padrão' },
    { id: 'GG', label: 'Padrão - GG', estoque: 50, ativo: true, tipo: 'Padrão' },
    { id: 'BL_P', label: 'Baby Look - P', estoque: 30, ativo: true, tipo: 'Baby Look' },
    { id: 'BL_M', label: 'Baby Look - M', estoque: 30, ativo: true, tipo: 'Baby Look' },
    { id: 'BL_G', label: 'Baby Look - G', estoque: 30, ativo: true, tipo: 'Baby Look' },
  ];

  for (const item of kitItems) {
    await setDoc(doc(db, 'nightrun_kit_items', item.id), {
      nome: item.nome,
      descricao: item.descricao,
      icone: item.icone
    });
  }

  for (const size of shirtSizes) {
    await setDoc(doc(db, 'nightrun_camisetas', size.id), {
      label: size.label,
      estoque: size.estoque,
      ativo: size.ativo,
      tipo: size.tipo,
      categoria: 'todos'
    });
  }

  console.log('Seed concluído!');
}
