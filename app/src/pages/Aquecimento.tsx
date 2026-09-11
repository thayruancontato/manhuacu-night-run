const APOIADORES_LOGO = [
  { nome: 'Prefeitura de Manhuaçu - Esporte', src: '/BRANCOS/PREFEITURA ESPORTE.png' },
  { nome: 'Ademare', src: '/BRANCOS/ADEMARE.png' },
  { nome: 'Sicoob Credilivre', src: '/BRANCOS/SICOOB.png' },
  { nome: 'Cafe Emerick', src: '/BRANCOS/CAFÉ EMERICK.png' },
  { nome: 'PlayKids', src: '/BRANCOS/PLAYKIDS.png' },
  { nome: 'Calpen', src: '/BRANCOS/CALPEN.png' },
  { nome: 'Mutumilk', src: '/BRANCOS/MUTUMILK.png' },
  { nome: 'Escola do Futuro', src: '/BRANCOS/ESCOLA DO FUTURO.png' },
  { nome: 'Tinauto', src: '/BRANCOS/TINAUTO.png' },
];

export default function Aquecimento() {
  return (
    <div className="aquecimento-viewport">
      <div className="aquecimento-wrap">
        <img src="/aquecimento-fundo.png" alt="" className="aquecimento-layer aquecimento-fundo" />

        <img src="/aquecimento-texto.png" alt="Momento de Aquecimento com Glauber Valentim" className="aquecimento-texto" />

        <img src="/aquecimento-atleta.png" alt="Glauber Valentim" className="aquecimento-layer aquecimento-atleta" />

        <div className="aquecimento-logos">
          {APOIADORES_LOGO.map((logo, i) => (
            <img
              key={logo.src}
              src={logo.src}
              alt={logo.nome}
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
      </div>

      <style>{`
        .aquecimento-viewport {
          min-height: 100svh;
          width: 100%;
          background: #071A45;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          box-sizing: border-box;
        }

        .aquecimento-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 5333 / 4000;
          line-height: 0;
          transform-origin: 50% 50%;
          animation: aquecimentoZoom 15s ease-in-out infinite;
        }

        .aquecimento-layer {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }

        .aquecimento-texto {
          position: absolute;
          left: 0;
          top: 0;
          width: 52%;
          height: 100%;
          object-fit: contain;
          object-position: left top;
          display: block;
        }

        .aquecimento-logos {
          position: absolute;
          left: 3%;
          bottom: 3%;
          width: 40%;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6.5% 6%;
        }

        .aquecimento-logos img {
          height: clamp(14px, 3.4vw, 34px);
          width: auto;
          max-width: 26%;
          object-fit: contain;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));
          animation: aquecimentoLogoFloat 3.2s ease-in-out infinite;
        }

        @keyframes aquecimentoLogoFloat {
          0%, 100% { transform: translateY(0); opacity: 0.92; }
          50%      { transform: translateY(-4px); opacity: 1; }
        }

        @keyframes aquecimentoZoom {
          0%   { transform: scale(1);    transform-origin: 50% 50%; }
          4%   { transform: scale(1.55); transform-origin: 22% 34%; }
          12%  { transform: scale(1.55); transform-origin: 22% 34%; }
          18%  { transform: scale(1.55); transform-origin: 62% 68%; }
          26%  { transform: scale(1.55); transform-origin: 62% 68%; }
          32%  { transform: scale(1.55); transform-origin: 80% 18%; }
          40%  { transform: scale(1.55); transform-origin: 80% 18%; }
          46%  { transform: scale(1);    transform-origin: 50% 50%; }
          100% { transform: scale(1);    transform-origin: 50% 50%; }
        }

        @media (max-width: 720px) {
          .aquecimento-logos { width: 55%; left: 4%; bottom: 2.5%; gap: 3% 5%; }
        }
      `}</style>
    </div>
  );
}
