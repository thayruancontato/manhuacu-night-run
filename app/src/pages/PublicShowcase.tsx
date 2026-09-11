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
  const [colunasPorLargura, setColunasPorLargura] = useState(() => calcularColunas());
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

  useEffect(() => {
    // Debounce + só recalcula se a largura realmente mudou de forma relevante - alguns
    // players/TVs disparam eventos de resize espúrios (troca de overscan, etc.).
    let larguraAnterior = window.innerWidth;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (Math.abs(window.innerWidth - larguraAnterior) < 80) return;
        larguraAnterior = window.innerWidth;
        setColunasPorLargura(calcularColunas());
      }, 800);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Monta os slots (posições fixas) só quando o número de colunas muda ou na primeira carga
  // de atletas - a partir daí, cada slot muda de conteúdo individualmente pela rotação, nunca
  // reconstruindo a coluna inteira (o que reiniciaria a rolagem de todo mundo de uma vez).
  useEffect(() => {
    if (atletas.length === 0) return;
    setSlots(prev => {
      if (prev.length === colunasPorLargura) return prev;
      const pool = embaralhar(atletas);
      let ponteiro = 0;
      const proximo = () => {
        const atleta = pool[ponteiro % pool.length];
        ponteiro += 1;
        return atleta;
      };
      return Array.from({ length: colunasPorLargura }, () =>
        Array.from({ length: SLOTS_POR_COLUNA }, () => ({ atleta: proximo(), versao: 0 }))
      );
    });
  }, [atletas, colunasPorLargura]);

  // Rotação: a cada intervalo, troca UMA posição aleatória (nunca a coluna toda) por outro
  // atleta aleatório do pool completo - com isso, ao longo do tempo, todo mundo passa pela
  // parede, e a troca em si é sempre individual, com fade (PhotoTile cuida da transição).
  // Só escolhe posições que estão FORA da área visível no momento (via getBoundingClientRect
  // nos elementos com data-slot), pra quem está olhando nunca ver a foto trocar na frente
  // dele - a "nova" foto só aparece quando rola naturalmente pra dentro da tela.
  useEffect(() => {
    const interval = setInterval(() => {
      setSlots(prev => {
        if (prev.length === 0) return prev;
        const pool = atletasRef.current;
        if (pool.length === 0) return prev;

        let colIndex = -1;
        let slotIndex = -1;
        for (let tentativa = 0; tentativa < 10; tentativa++) {
          const c = Math.floor(Math.random() * prev.length);
          const s = Math.floor(Math.random() * prev[c].length);
          const els = document.querySelectorAll(`[data-slot="${c}-${s}"]`);
          const visivel = els.length > 0 && Array.from(els).some(el => {
            const r = el.getBoundingClientRect();
            return r.bottom > -40 && r.top < window.innerHeight + 40;
          });
          if (!visivel) { colIndex = c; slotIndex = s; break; }
        }
        if (colIndex === -1) return prev; // tudo visível agora (tela pequena) - espera o próximo tick

        const novoAtleta = pool[Math.floor(Math.random() * pool.length)];
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
