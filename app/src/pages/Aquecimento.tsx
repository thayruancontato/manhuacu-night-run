function Letras({ text, className = '' }: { text: string; className?: string }) {
  return (
    <>
      {text.split('').map((ch, i) => (
        <span
          key={i}
          className={`aq-letra ${className}`}
          style={{ animationDelay: `${i * 0.07}s` }}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  );
}

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

        <svg className="aquecimento-fita" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="aquecimento-fita-path aquecimento-fita-b" d="M 15 0 L 85 100" pathLength={1} />
        </svg>

        <div className="aquecimento-texto">
          <p className="aq-linha1"><Letras text="MOMENTO DE" /></p>
          <p className="aq-linha2">
            <Letras text="AQUECIMENTO" />
          </p>
          <div className="aquecimento-nome-shake">
            <p className="aq-nome1"><Letras text="GLAUBER" /></p>
            <p className="aq-nome2">
              <Letras text="VALENTIM" />
              <span className="aq-risco aq-risco3" />
              <span className="aquecimento-vem">Vem se preparar com a gente!</span>
            </p>
          </div>
        </div>

        <svg className="aquecimento-fita" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="aquecimento-fita-path aquecimento-fita-a" d="M -15 100 L 15 0" pathLength={1} />
          <path className="aquecimento-fita-path aquecimento-fita-c" d="M 85 100 L 115 0" pathLength={1} />
        </svg>

        <div className="aquecimento-atleta-flutua">
          <img src="/aquecimento-atleta.png" alt="Glauber Valentim" className="aquecimento-layer aquecimento-atleta" />
        </div>

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
          will-change: transform;
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

        .aquecimento-atleta-flutua {
          position: absolute;
          inset: 0;
          transform-origin: 50% 100%;
          will-change: transform;
          animation: aquecimentoAtletaFloat 4.6s ease-in-out infinite;
        }

        .aquecimento-atleta {
          will-change: transform;
          animation: aquecimentoAtletaPunch 15s ease-out infinite;
        }

        .aquecimento-fita {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
          pointer-events: none;
          filter: drop-shadow(0 0 14px rgba(107,255,42,0.65));
        }

        .aquecimento-fita-path {
          fill: none;
          stroke: #6BFF2A;
          stroke-width: 3.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1 1;
          stroke-dashoffset: 1;
          animation-duration: 10s;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        .aquecimento-fita-a { animation-name: aquecimentoFitaA; }
        .aquecimento-fita-b { animation-name: aquecimentoFitaB; }
        .aquecimento-fita-c { animation-name: aquecimentoFitaC; }

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
          top: 4%;
          bottom: 20%;
          width: 58%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2%;
          font-family: 'Aquecimento Anton', 'Arial Narrow', sans-serif;
          text-transform: uppercase;
        }

        .aquecimento-texto p {
          margin: 0;
          position: relative;
          line-height: 0.92;
          transform: skewX(-6deg);
        }

        .aq-letra {
          display: inline-block;
          animation: aquecimentoLetraFloat 2.6s ease-in-out infinite;
        }

        .aq-linha1 {
          color: #fff;
          font-size: clamp(1.7rem, 7.6vw, 6rem);
          text-shadow: 0 3px 0 rgba(0,0,0,0.35), 0 0 18px rgba(0,0,0,0.3);
        }

        .aq-linha2 {
          color: #6BFF2A;
          font-size: clamp(2.5rem, 11vw, 8.8rem);
          text-shadow: 0 4px 0 rgba(0,0,0,0.4);
        }

        .aq-nome1 {
          color: #fff;
          font-size: clamp(2.4rem, 10.5vw, 8.2rem);
          text-shadow: 0 3px 0 rgba(0,0,0,0.35);
        }

        .aq-nome2 {
          color: #6BFF2A;
          font-size: clamp(2.4rem, 10.5vw, 8.2rem);
          text-shadow: 0 3px 0 rgba(0,0,0,0.35);
        }

        .aq-risco {
          position: absolute;
          left: 0;
          height: 0.16em;
          background: #6BFF2A;
          clip-path: polygon(0% 30%, 92% 0%, 100% 55%, 6% 100%);
          transform: skewX(-6deg);
        }

        .aq-risco3 {
          bottom: -0.24em;
          width: 82%;
          animation: aquecimentoRiscoPunch 20s ease-in-out infinite;
          animation-delay: 15s;
        }

        .aquecimento-nome-shake {
          animation: aquecimentoNomeShake 20s ease-in-out infinite;
          animation-delay: 15s;
        }

        .aquecimento-vem {
          position: absolute;
          left: 1%;
          top: 100%;
          margin-top: 1.6em;
          width: 98%;
          font-family: 'Aquecimento Anton', 'Arial Narrow', sans-serif;
          text-transform: none;
          color: #fff;
          font-size: clamp(1rem, 3.1vw, 2.3rem);
          letter-spacing: 0.01em;
          text-shadow: 0 2px 0 rgba(0,0,0,0.4);
          opacity: 0;
          transform: translateY(-220%) scaleY(0.4);
          transform-origin: 50% 0%;
          white-space: nowrap;
          animation: aquecimentoVemCai 20s ease-in-out infinite;
          animation-delay: 15s;
        }

        .aquecimento-logos {
          position: absolute;
          left: 3%;
          bottom: 3%;
          width: 40%;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 15% 6%;
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

        @keyframes aquecimentoLetraFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-0.14em); }
        }

        @keyframes aquecimentoAtletaFloat {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.018); }
        }

        @keyframes aquecimentoFitaA {
          0%     { stroke-dashoffset: 1; }
          4.7%   { stroke-dashoffset: 0; }
          22.7%  { stroke-dashoffset: 0; }
          27.4%  { stroke-dashoffset: -1; }
          100%   { stroke-dashoffset: -1; }
        }

        @keyframes aquecimentoFitaB {
          0%     { stroke-dashoffset: 1; }
          4.7%   { stroke-dashoffset: 1; }
          9.3%   { stroke-dashoffset: 0; }
          27.4%  { stroke-dashoffset: 0; }
          32%    { stroke-dashoffset: -1; }
          100%   { stroke-dashoffset: -1; }
        }

        @keyframes aquecimentoFitaC {
          0%     { stroke-dashoffset: 1; }
          9.3%   { stroke-dashoffset: 1; }
          14%    { stroke-dashoffset: 0; }
          32%    { stroke-dashoffset: 0; }
          36.7%  { stroke-dashoffset: -1; }
          100%   { stroke-dashoffset: -1; }
        }

        @keyframes aquecimentoNomeShake {
          0%, 76%   { transform: translate(0, 0) rotate(0deg); }
          77%       { transform: translate(-0.25%, 0) rotate(-0.4deg); }
          78%       { transform: translate(0.25%, 0) rotate(0.4deg); }
          79%       { transform: translate(-0.45%, 0) rotate(-0.7deg); }
          80%       { transform: translate(0.45%, 0) rotate(0.7deg); }
          81%       { transform: translate(-0.65%, 0) rotate(-1deg); }
          82%       { transform: translate(0.65%, 0) rotate(1deg); }
          83%       { transform: translate(-0.4%, -1.6%) rotate(-2.4deg); }
          84.5%     { transform: translate(0.2%, -2.4%) rotate(-1.6deg); }
          86%       { transform: translate(0, 2.6%) rotate(1.2deg); }
          88%       { transform: translate(0, -0.6%) rotate(-0.3deg); }
          90%, 100% { transform: translate(0, 0) rotate(0deg); }
        }

        @keyframes aquecimentoRiscoPunch {
          0%, 85.5% { transform: skewX(-6deg) translateY(0)     scaleY(1);    filter: brightness(1); }
          86%       { transform: skewX(-6deg) translateY(20%)   scaleY(0.55); filter: brightness(2.1); }
          88%       { transform: skewX(-6deg) translateY(-7%)   scaleY(1.18); filter: brightness(1.15); }
          91%       { transform: skewX(-6deg) translateY(2%)    scaleY(0.96); filter: brightness(1); }
          94%, 100% { transform: skewX(-6deg) translateY(0)     scaleY(1);    filter: brightness(1); }
        }

        @keyframes aquecimentoVemCai {
          0%, 86%   { opacity: 0; transform: translateY(-220%) scaleY(0.4); }
          87.5%     { opacity: 1; transform: translateY(14%) scaleY(1.12); }
          90%       { opacity: 1; transform: translateY(-5%) scaleY(0.95); }
          92.5%     { opacity: 1; transform: translateY(0%) scaleY(1); }
          97%       { opacity: 1; transform: translateY(0%) scaleY(1); }
          99%, 100% { opacity: 0; transform: translateY(0%) scaleY(1); }
        }

        @keyframes aquecimentoAtletaPunch {
          0%   { transform: scale(0.94); }
          5%   { transform: scale(1.03); }
          9%   { transform: scale(1); }
          100% { transform: scale(1); }
        }

        @keyframes aquecimentoZoom {
          0%   { transform: scale(1);    transform-origin: 50% 50%; }
          4%   { transform: scale(1.55); transform-origin: 32% 40%; }
          12%  { transform: scale(1.55); transform-origin: 32% 40%; }
          18%  { transform: scale(2.2);  transform-origin: 23% 88%; }
          26%  { transform: scale(2.2);  transform-origin: 23% 88%; }
          32%  { transform: scale(1.55); transform-origin: 64% 20%; }
          40%  { transform: scale(1.55); transform-origin: 64% 20%; }
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
