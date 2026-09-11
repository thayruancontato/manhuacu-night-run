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

        <img src="/aquecimento-logo-gv.png" alt="" className="aquecimento-logo-marca" aria-hidden="true" />

        <div className="aquecimento-texto">
          <p className="aq-linha1">MOMENTO DE</p>
          <p className="aq-linha2">
            AQUECIMENTO
            <span className="aq-risco aq-risco1" />
          </p>
          <p className="aq-com">
            COM
            <span className="aq-risco aq-risco2" />
          </p>
          <p className="aq-nome1">GLAUBER</p>
          <p className="aq-nome2">
            VALENTIM
            <span className="aq-risco aq-risco3" />
          </p>
        </div>

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
        @font-face {
          font-family: 'Aquecimento Anton';
          src: url('/fonts/Anton-Regular.ttf') format('truetype');
          font-weight: 400;
          font-display: swap;
        }

        .aquecimento-viewport {
          height: 100svh;
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
          aspect-ratio: 5333 / 4000;
          width: min(100%, calc(100svh * 5333 / 4000));
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

        .aquecimento-atleta {
          animation: aquecimentoAtletaPunch 15s ease-out infinite;
        }

        .aquecimento-logo-marca {
          position: absolute;
          left: 50%;
          top: 46%;
          width: 62%;
          transform: translate(-50%, -50%);
          opacity: 0.4;
          mix-blend-mode: overlay;
          filter: invert(1);
          pointer-events: none;
        }

        .aquecimento-texto {
          position: absolute;
          left: 3%;
          top: 8%;
          width: 56%;
          line-height: 0.92;
          font-family: 'Aquecimento Anton', 'Arial Narrow', sans-serif;
          text-transform: uppercase;
        }

        .aquecimento-texto p {
          margin: 0;
          position: relative;
          transform: skewX(-6deg);
        }

        .aq-linha1 {
          color: #fff;
          font-size: clamp(1.1rem, 4.6vw, 3.6rem);
          text-shadow: 0 3px 0 rgba(0,0,0,0.35), 0 0 18px rgba(0,0,0,0.3);
        }

        .aq-linha2 {
          color: #6BFF2A;
          font-size: clamp(1.5rem, 6.4vw, 5rem);
          text-shadow: 0 4px 0 rgba(0,0,0,0.4);
          margin-bottom: 6%;
          animation: aquecimentoGlow 3.4s ease-in-out infinite;
        }

        .aq-com {
          color: #fff;
          font-size: clamp(0.7rem, 2.4vw, 1.7rem);
          margin-top: 4%;
        }

        .aq-nome1 {
          color: #fff;
          font-size: clamp(1.2rem, 5vw, 4rem);
          text-shadow: 0 3px 0 rgba(0,0,0,0.35);
        }

        .aq-nome2 {
          color: #6BFF2A;
          font-size: clamp(1.2rem, 5vw, 4rem);
          text-shadow: 0 3px 0 rgba(0,0,0,0.35);
          animation: aquecimentoGlow 3.4s ease-in-out infinite;
          animation-delay: 1.2s;
        }

        .aq-risco {
          position: absolute;
          left: 0;
          height: 0.16em;
          background: #6BFF2A;
          clip-path: polygon(0% 30%, 92% 0%, 100% 55%, 6% 100%);
          transform: skewX(-6deg);
        }

        .aq-risco1 { bottom: -0.22em; width: 78%; }
        .aq-risco2 { bottom: -0.3em; width: 55%; height: 0.1em; }
        .aq-risco3 { bottom: -0.24em; width: 82%; }

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

        @keyframes aquecimentoGlow {
          0%, 100% { filter: brightness(1); }
          50%      { filter: brightness(1.35); }
        }

        @keyframes aquecimentoAtletaPunch {
          0%   { transform: scale(0.94); }
          5%   { transform: scale(1.03); }
          9%   { transform: scale(1); }
          100% { transform: scale(1); }
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
