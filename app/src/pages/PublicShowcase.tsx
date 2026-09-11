import { useEffect, useState } from 'react';
import '../App.css';

// Parede de fotos em loop infinito pra telão do evento - mesmo efeito visual da tela
// "Inscrições esgotadas" (SoldOutScreen.tsx: colunas alternando pra cima/baixo, foto
// duplicada pra fechar o loop sem emenda visível), com a logo pulsando no centro por cima
// e cobrindo TODOS os confirmados, não só uma amostra de 60.
const MIN_CARDS_PER_COLUMN = 14;
// Segundos de loop por card - controla a velocidade (mais cards por coluna = loop mais
// longo, senão a rolagem ficaria cada vez mais rápida quanto mais gente se inscrever).
const SECONDS_PER_CARD = 0.55;

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

      <div className="showcase-logo-overlay">
        <div className="showcase-logo-backdrop" />
        <img src="/LOGO NIGHT RUN SEM FUNDO (em amarelo).png" alt="MCU Night Run" className="showcase-logo" />
      </div>
    </div>
  );
}

function calcularColunas() {
  const largura = typeof window !== 'undefined' ? window.innerWidth : 1920;
  return Math.min(24, Math.max(6, Math.round(largura / 190)));
}
