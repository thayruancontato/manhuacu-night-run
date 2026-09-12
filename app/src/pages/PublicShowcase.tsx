import { useEffect, useRef, useState } from 'react';
import '../App.css';

// Parede de fotos pra telão do evento - colunas rolando pra cima/baixo em loop contínuo
// (mesmo efeito da tela "Inscrições esgotadas": conteúdo duplicado 2x fecha o loop sem
// emenda visível). Cada coluna tem um número FIXO de posições ("slots"); de tempos em
// tempos, uma posição aleatória troca de foto sozinha com fade-out/fade-in - nunca a
// coluna inteira de uma vez - e ao longo do tempo isso passa por TODOS os confirmados,
// não só uma amostra.
const SLOTS_POR_COLUNA = 16;
const SECONDS_PER_CARD = 1.6;
const ROTACAO_INTERVALO_MS = 4000;
const FADE_MS = 900;

// Apoiadores exibidos na faixa lateral - logos brancos (pasta /BRANCOS), feitos pra ficar
// direto sobre o fundo navy da faixa, sem base branca por trás (um card branco deixaria a
// logo branca invisível).
const APOIADORES = [
  { nome: 'Sicoob Credilivre', logo: '/BRANCOS/SICOOB.png' },
  { nome: 'Cafe Emerick', logo: '/BRANCOS/CAFÉ EMERICK.png' },
  { nome: 'PlayKids', logo: '/BRANCOS/PLAYKIDS.png' },
  { nome: 'Calpen', logo: '/BRANCOS/CALPEN.png' },
  { nome: 'Mutumilk', logo: '/BRANCOS/MUTUMILK.png' },
  { nome: 'Escola do Futuro', logo: '/BRANCOS/ESCOLA DO FUTURO.png' },
  { nome: 'Tinauto', logo: '/BRANCOS/TINAUTO.png' },
];

type Atleta = { id: string; fotoUrl: string; nome: string };

// Fisher-Yates - o roster chega sempre ordenado por nome (estável de propósito no worker),
// então sem embaralhar aqui a escolha de quem entra em cada slot seguiria sempre a mesma
// ordem alfabética.
const embaralhar = <T,>(lista: T[]): T[] => {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
};

// Um "slot" é uma posição fixa na parede (coluna + índice). Guarda o próprio atleta em vez
// de derivar de um índice corrido, porque a rotação troca posições aleatórias avulsas, não
// em sequência.
type Slot = { atleta: Atleta; versao: number };

function PhotoTile({ atleta, slotKey }: { atleta: Atleta; slotKey: string }) {
  const [exibido, setExibido] = useState(atleta);
  const [desvanecendo, setDesvanecendo] = useState(false);

  useEffect(() => {
    if (atleta.id === exibido.id) return;
    setDesvanecendo(true);
    const t1 = setTimeout(() => {
      setExibido(atleta);
      setDesvanecendo(false);
    }, FADE_MS / 2);
    return () => clearTimeout(t1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atleta.id]);

  return (
    <div className={`showcase-card ${desvanecendo ? 'showcase-card-fading' : ''}`} data-slot={slotKey}>
      {exibido.fotoUrl ? (
        <img src={exibido.fotoUrl} alt="" decoding="async" />
      ) : (
        <div className="showcase-card-fallback">
          <span className="showcase-card-fallback-letra">{(exibido.nome || '?').trim().charAt(0).toUpperCase()}</span>
          <span className="showcase-card-fallback-nome">{(exibido.nome || '').trim().split(/\s+/)[0]}</span>
        </div>
      )}
    </div>
  );
}

export default function PublicShowcase() {
  const [atletas, setAtletas] = useState<Atleta[]>([]);
  const colunasPorLargura = useRef(calcularColunas()).current;
  const [slots, setSlots] = useState<Slot[][]>([]);
  const atletasRef = useRef<Atleta[]>([]);

  useEffect(() => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    const carregarRoster = async () => {
      try {
        const res = await fetch(`${workerUrl}/roster/confirmed`);
        const data = await res.json();
        // Inscrições escolares (cortesia pras escolas municipais) não devem aparecer no
        // telão do evento.
        const lista: Atleta[] = (data.athletes || [])
          .filter((a: any) => !a.tagEscolar)
          .map((a: any) => ({
            id: a.id,
            nome: a.nome || '',
            fotoUrl: a.fotoUrl || '',
          }));
        atletasRef.current = lista;
        setAtletas(lista);
      } catch (e) {
        console.error('Erro ao buscar confirmados para o showcase:', e);
      }
    };

    carregarRoster();
    // Recarrega periodicamente só pra atualizar o "pool" de quem pode aparecer (gente que
    // confirmou depois que a página abriu) - não mexe no que já está em tela, isso é feito
    // pela rotação de slots abaixo.
    const interval = setInterval(carregarRoster, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Monta os slots (posições fixas) só UMA VEZ, na primeira carga de atletas - nunca mais
  // depois disso, nem se o número de colunas mudar (resize) nem se o pool de atletas mudar
  // (gente confirmando ao longo do dia). Reconstruir tudo de novo trocaria o conteúdo de
  // toda a parede de uma vez, sem passar pelo fade individual do PhotoTile - exatamente o
  // "muda tudo do nada, sem fade" relatado. A partir do primeiro monte, só a rotação abaixo
  // muda conteúdo, sempre um slot de cada vez.
  const jaMontadoRef = useRef(false);
  useEffect(() => {
    if (jaMontadoRef.current || atletas.length === 0) return;
    jaMontadoRef.current = true;
    const pool = embaralhar(atletas);
    let ponteiro = 0;
    const proximo = () => {
      const atleta = pool[ponteiro % pool.length];
      ponteiro += 1;
      return atleta;
    };
    setSlots(
      Array.from({ length: colunasPorLargura }, () =>
        Array.from({ length: SLOTS_POR_COLUNA }, () => ({ atleta: proximo(), versao: 0 }))
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atletas]);

  // Rotação: a cada intervalo, troca UMA posição por outro atleta aleatório do pool completo
  // - com isso, ao longo do tempo, todo mundo passa pela parede, e a troca em si é sempre
  // individual, com fade (PhotoTile cuida da transição). Só escolhe posições que estão FORA
  // da área visível no momento (via getBoundingClientRect nos elementos com data-slot), pra
  // quem está olhando nunca ver a foto trocar na frente dele.
  //
  // A ordem das posições vem de uma FILA embaralhada com TODAS as combinações (coluna,
  // altura) uma vez cada, reorganizada pra nunca repetir a mesma altura (mesmo slotIndex) em
  // colunas diferentes muito perto uma da outra no tempo - sem isso, de vez em quando o
  // acaso batia várias colunas na mesma altura em poucos segundos, e visualmente parecia
  // "uma linha inteira" trocando de uma vez, mesmo sendo trocas individuais coincidindo.
  const filaRef = useRef<{ col: number; slot: number }[]>([]);
  const montarFila = (numColunas: number, numSlots: number) => {
    const pares: { col: number; slot: number }[] = [];
    for (let c = 0; c < numColunas; c++) for (let s = 0; s < numSlots; s++) pares.push({ col: c, slot: s });
    const embaralhada = embaralhar(pares);
    // Afasta pares consecutivos que compartilham a mesma altura (slot) em colunas diferentes.
    for (let i = 1; i < embaralhada.length; i++) {
      if (embaralhada[i].slot !== embaralhada[i - 1].slot) continue;
      for (let j = i + 1; j < embaralhada.length; j++) {
        if (embaralhada[j].slot !== embaralhada[i - 1].slot) {
          [embaralhada[i], embaralhada[j]] = [embaralhada[j], embaralhada[i]];
          break;
        }
      }
    }
    return embaralhada;
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setSlots(prev => {
        if (prev.length === 0) return prev;
        const pool = atletasRef.current;
        if (pool.length === 0) return prev;

        if (filaRef.current.length === 0) {
          filaRef.current = montarFila(prev.length, prev[0].length);
        }

        let colIndex = -1;
        let slotIndex = -1;
        const adiados: { col: number; slot: number }[] = [];
        while (filaRef.current.length > 0) {
          const candidato = filaRef.current.shift()!;
          const els = document.querySelectorAll(`[data-slot="${candidato.col}-${candidato.slot}"]`);
          const visivel = els.length > 0 && Array.from(els).some(el => {
            const r = el.getBoundingClientRect();
            return r.bottom > -40 && r.top < window.innerHeight + 40;
          });
          if (!visivel) { colIndex = candidato.col; slotIndex = candidato.slot; break; }
          adiados.push(candidato);
          if (adiados.length > 20) break; // evita travar procurando indefinidamente
        }
        filaRef.current.push(...adiados);
        if (colIndex === -1) return prev; // tudo visível agora (tela pequena) - espera o próximo tick

        // Nunca repete alguém que já está em outra posição da parede nesse momento - só
        // sorteia entre quem ainda não aparece em lugar nenhum agora. Só recai no pool
        // inteiro no caso extremo de ter mais posições na parede do que atletas confirmados
        // (aí repetir é matematicamente inevitável).
        const idsNaParede = new Set<string>();
        prev.forEach(col => col.forEach(s => idsNaParede.add(s.atleta.id)));
        const candidatos = pool.filter(a => !idsNaParede.has(a.id));
        const poolSorteio = candidatos.length > 0 ? candidatos : pool;
        const novoAtleta = poolSorteio[Math.floor(Math.random() * poolSorteio.length)];
        if (novoAtleta.id === prev[colIndex][slotIndex].atleta.id) return prev;
        const proximo = prev.map(col => col.slice());
        proximo[colIndex][slotIndex] = { atleta: novoAtleta, versao: prev[colIndex][slotIndex].versao + 1 };
        return proximo;
      });
    }, ROTACAO_INTERVALO_MS);
    return () => clearInterval(interval);
  }, []);

  if (slots.length === 0) return <div className="showcase-root" />;

  return (
    <div className="showcase-root">
      <div className="showcase-wall">
        {slots.map((col, colIndex) => {
          const duracao = Math.max(5, col.length * SECONDS_PER_CARD);
          return (
            <div
              key={colIndex}
              className={`showcase-col ${colIndex % 2 === 0 ? 'showcase-col-up' : 'showcase-col-down'}`}
              style={{ animationDuration: `${duracao}s`, animationDelay: `${-(colIndex * 3.5)}s` }}
            >
              {Array.from({ length: col.length * 2 }, (_, i) => (
                <PhotoTile key={`${colIndex}-${i}`} slotKey={`${colIndex}-${i % col.length}`} atleta={col[i % col.length].atleta} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="showcase-sidebar">
        <div className="showcase-sidebar-top">
          <img src="/LOGO NIGHT RUN SEM FUNDO (em amarelo).png" alt="MCU Night Run" className="showcase-sidebar-logo" />
          <img src="/BRANCOS/PREFEITURA ESPORTE.png" alt="Prefeitura de Manhuaçu - Esporte" className="showcase-sidebar-prefeitura" />
        </div>

        <div className="showcase-sidebar-section">
          <span className="showcase-sidebar-label">Realização</span>
          <div className="showcase-sponsor-card showcase-sponsor-card-solo">
            <img src="/BRANCOS/ADEMARE.png" alt="Ademare" />
          </div>
        </div>

        <div className="showcase-sidebar-section">
          <span className="showcase-sidebar-label">Apoio</span>
          <div className="showcase-sponsor-grid">
            {APOIADORES.map(apoiador => (
              <div className="showcase-sponsor-card" key={apoiador.nome}>
                {apoiador.logo ? (
                  <img src={apoiador.logo} alt={apoiador.nome} />
                ) : (
                  <span className="showcase-sponsor-nome">{apoiador.nome}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function calcularColunas() {
  const larguraTela = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const larguraFaixa = Math.min(320, Math.max(220, larguraTela * 0.18));
  const larguraParede = larguraTela - larguraFaixa;
  return Math.min(24, Math.max(5, Math.round(larguraParede / 190)));
}
