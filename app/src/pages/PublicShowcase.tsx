import { useEffect, useState } from 'react';
import '../App.css';

// Parede de fotos em loop infinito pra telão do evento - mesmo efeito visual da tela
// "Inscrições esgotadas" (SoldOutScreen.tsx: colunas alternando pra cima/baixo, foto
// duplicada pra fechar o loop sem emenda visível) - cobrindo TODOS os confirmados, não só
// uma amostra de 60. Faixa lateral fixa à direita com as logos (não fica nada por cima da
// parede de fotos).
const MIN_CARDS_PER_COLUMN = 14;
// Segundos de loop por card - controla a velocidade (mais cards por coluna = loop mais
// longo, senão a rolagem ficaria cada vez mais rápida quanto mais gente se inscrever).
const SECONDS_PER_CARD = 0.55;

// Apoiadores exibidos na faixa lateral, cada um numa base branca. Os arquivos de logo (além
// da Ademare, já usada no resto do site) ainda precisam ser enviados - até lá aparece o nome
// como texto no lugar da imagem.
const APOIADORES = [
  { nome: 'Sicoob Credilivre', logo: '' },
  { nome: 'Cafe Emerick', logo: '' },
  { nome: 'PlayKids', logo: '' },
  { nome: 'Calpen', logo: '' },
  { nome: 'Mutumilk', logo: '' },
  { nome: 'Escola do Futuro', logo: '' },
  { nome: 'Tinauto', logo: '' },
];

type Atleta = { id: string; fotoUrl: string; nome: string };

export default function PublicShowcase() {
  const [atletas, setAtletas] = useState<Atleta[]>([]);
  const [numColunas, setNumColunas] = useState(() => calcularColunas());

  useEffect(() => {
    (async () => {
      try {
        // Mesmo endpoint cacheado (KV, não Firestore direto) usado pela tela pública inicial -
        // este showcase fica ligado o evento inteiro num telão, então cada leitura direta ao
        // Firestore aqui se repetiria indefinidamente.
        const workerUrl = import.meta.env.VITE_WORKER_URL;
        const res = await fetch(`${workerUrl}/roster/confirmed`);
        const data = await res.json();
        const lista: Atleta[] = (data.athletes || []).map((a: any) => ({
          id: a.id,
          nome: a.nome || '',
          fotoUrl: a.fotoUrl || '',
        }));
        setAtletas(lista);
      } catch (e) {
        console.error('Erro ao buscar confirmados para o showcase:', e);
      }
    })();
  }, []);

  useEffect(() => {
    const onResize = () => setNumColunas(calcularColunas());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Recarrega a lista periodicamente - o telão fica ligado o evento inteiro, então precisa
  // pegar gente que se inscreveu depois que a página abriu. O cache do worker já limita o
  // custo real (KV, não Firestore) mesmo com essa atualização recorrente.
  useEffect(() => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${workerUrl}/roster/confirmed`);
        const data = await res.json();
        const lista: Atleta[] = (data.athletes || []).map((a: any) => ({
          id: a.id,
          nome: a.nome || '',
          fotoUrl: a.fotoUrl || '',
        }));
        setAtletas(lista);
      } catch (e) {
        console.error('Erro ao atualizar showcase:', e);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
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
        <img src="/LOGO NIGHT RUN SEM FUNDO (em amarelo).png" alt="MCU Night Run" className="showcase-sidebar-logo" />

        <div className="showcase-sidebar-section">
          <span className="showcase-sidebar-label">Realização</span>
          <div className="showcase-sponsor-card showcase-sponsor-card-solo">
            <img src="/logo-ademare.png" alt="Ademare" />
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
