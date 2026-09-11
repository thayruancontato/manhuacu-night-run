import { useEffect, useRef, useState } from 'react';
import '../App.css';

// Parede de fotos em loop infinito pra telão do evento - mesmo efeito visual da tela
// "Inscrições esgotadas" (SoldOutScreen.tsx: colunas alternando pra cima/baixo, foto
// duplicada pra fechar o loop sem emenda visível) - cobrindo TODOS os confirmados, não só
// uma amostra de 60. Faixa lateral fixa à direita com as logos (não fica nada por cima da
// parede de fotos).
const MIN_CARDS_PER_COLUMN = 14;
// Segundos de loop por card - controla a velocidade (mais cards por coluna = loop mais
// longo, senão a rolagem ficaria cada vez mais rápida quanto mais gente se inscrever).
const SECONDS_PER_CARD = 0.28;
// Piso de fotos ÚNICAS que cada coluna precisa ter antes de repetir - numa tela muito larga,
// calcularColunas() sozinho criaria colunas demais e finas, cada uma com pouca gente
// (repetindo rápido e dando a impressão de que "não passa todo mundo"). Isso limita o número
// de colunas em telas grandes pra garantir bastante gente por coluna antes do loop reiniciar.
const MIN_UNICOS_POR_COLUNA = 45;

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

// Fisher-Yates - o roster chega sempre ordenado por nome (feito assim de propósito no
// worker, pra ficar estável entre chamadas), então sem embaralhar aqui a parede mostrava
// sempre a mesma composição/posição a cada abertura da página. Embaralha uma vez por
// atualização real da lista (não a cada re-render).
const embaralhar = <T,>(lista: T[]): T[] => {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
};

export default function PublicShowcase() {
  const [atletas, setAtletas] = useState<Atleta[]>([]);
  const [colunasPorLargura, setColunasPorLargura] = useState(() => calcularColunas());
  // Captura o total de confirmados só na PRIMEIRA carga, pra calcular o número de colunas
  // uma única vez - se recalculasse toda vez que mais gente confirma (atletas.length
  // crescendo ao longo do dia), de vez em quando o número de colunas mudaria de patamar e
  // redistribuiria TODO mundo de novo (o corte brusco que a rolagem "some fora da tela, nova
  // adicionada" deveria evitar). Mais gente confirmando depois só deixa as colunas mais
  // fundas, nunca precisa de menos.
  const totalInicialRef = useRef(0);
  // Nunca deixa a tela ter colunas de menos gente demais - se a largura permitiria mais
  // colunas do que o total de confirmados sustenta com boa profundidade, usa menos colunas
  // (mais largas) em vez de mais colunas finas repetindo rápido.
  const numColunas = totalInicialRef.current > 0
    ? Math.max(1, Math.min(colunasPorLargura, Math.floor(totalInicialRef.current / MIN_UNICOS_POR_COLUNA) || 1))
    : colunasPorLargura;

  useEffect(() => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    // Nunca troca a lista inteira (nem re-embaralha) numa atualização - isso descartaria o
    // arranjo em tela e todo mundo saltaria de posição de uma vez. Quem já está na lista
    // mantém exatamente a mesma posição; só quem confirmou de novo entra, embaralhado, no
    // final de cada coluna (novo conteúdo entra por baixo/por cima da tela, sem cortar a
    // rolagem de quem já estava passando).
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
        setAtletas(atual => {
          if (atual.length === 0) {
            totalInicialRef.current = lista.length;
            return embaralhar(lista);
          }
          const idsNovaLista = new Set(lista.map(a => a.id));
          const mantidos = atual.filter(a => idsNovaLista.has(a.id));
          const idsMantidos = new Set(mantidos.map(a => a.id));
          const novos = lista.filter(a => !idsMantidos.has(a.id));
          if (novos.length === 0 && mantidos.length === atual.length) return atual;
          return [...mantidos, ...embaralhar(novos)];
        });
      } catch (e) {
        console.error('Erro ao buscar confirmados para o showcase:', e);
      }
    };

    carregarRoster();
    // Recarrega periodicamente - o telão fica ligado o evento inteiro, então precisa pegar
    // gente que confirmou depois que a página abriu. Agora que a atualização só ACRESCENTA
    // gente nova sem mexer em quem já está na tela, pode ser mais frequente sem risco de
    // corte brusco. O endpoint já é cacheado (KV, não Firestore), então isso não pesa no
    // banco mesmo rodando o dia inteiro.
    const interval = setInterval(carregarRoster, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Debounce + só recalcula se a largura realmente mudou de forma relevante - alguns
    // players/TVs disparam eventos de resize espúrios (troca de overscan, etc.) que, sem
    // essa proteção, redistribuíam as colunas à toa e reiniciavam a animação inteira.
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

  const colunas = Array.from({ length: numColunas }, (_, colIndex) => {
    const base = atletas.filter((_, i) => i % numColunas === colIndex);
    if (base.length === 0) return [] as Atleta[];
    const preenchida: Atleta[] = [];
    while (preenchida.length < MIN_CARDS_PER_COLUMN) preenchida.push(...base);
    return preenchida;
  }).filter(col => col.length > 0);

  if (colunas.length === 0) return <div className="showcase-root" />;

  return (
    <div className="showcase-root">
      <div className="showcase-wall">
        {colunas.map((col, colIndex) => {
          const duracao = Math.max(5, col.length * SECONDS_PER_CARD);
          return (
            <div
              key={colIndex}
              className={`showcase-col ${colIndex % 2 === 0 ? 'showcase-col-up' : 'showcase-col-down'}`}
              style={{ animationDuration: `${duracao}s`, animationDelay: `${-(colIndex * 3.5)}s` }}
            >
              {[...col, ...col].map((atleta, i) => (
                <div className="showcase-card" key={`${colIndex}-${i}-${atleta.id}`}>
                  {atleta.fotoUrl ? (
                    <img src={atleta.fotoUrl} alt="" decoding="async" />
                  ) : (
                    <div className="showcase-card-fallback">
                      <span className="showcase-card-fallback-letra">{(atleta.nome || '?').trim().charAt(0).toUpperCase()}</span>
                      <span className="showcase-card-fallback-nome">{(atleta.nome || '').trim().split(/\s+/)[0]}</span>
                    </div>
                  )}
                </div>
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
