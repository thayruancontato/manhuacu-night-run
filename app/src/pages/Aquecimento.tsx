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
    <div style={{ minHeight: '100svh', background: '#071A45', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
      <div className="aquecimento-wrap">
        <img src="/aquecimento.png" alt="Momento de Aquecimento com Glauber Valentim" className="aquecimento-photo" />

        <div className="aquecimento-lupa" aria-hidden="true" />

        <div className="aquecimento-logos">
          {APOIADORES_LOGO.map((logo) => (
            <img key={logo.src} src={logo.src} alt={logo.nome} />
          ))}
        </div>
      </div>

      <style>{`
        .aquecimento-wrap {
          position: relative;
          width: 100%;
          max-width: 1400px;
          line-height: 0;
          overflow: hidden;
        }

        .aquecimento-photo {
          display: block;
          width: 100%;
          height: auto;
        }

        .aquecimento-logos {
          position: absolute;
          left: 3%;
          bottom: 3%;
          width: 40%;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 3% 6%;
        }

        .aquecimento-logos img {
          height: clamp(14px, 3.4vw, 34px);
          width: auto;
          max-width: 26%;
          object-fit: contain;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));
        }

        .aquecimento-lupa {
          position: absolute;
          aspect-ratio: 1 / 1;
          width: 30%;
          border-radius: 50%;
          border: 6px solid rgba(255,255,255,0.92);
          box-shadow: 0 0 0 3px rgba(0,0,0,0.25), 0 10px 30px rgba(0,0,0,0.45), inset 0 0 24px rgba(0,0,0,0.25);
          background-image: url('/aquecimento.png');
          background-repeat: no-repeat;
          background-size: 380% 380%;
          pointer-events: none;
          transform: translate(-50%, -50%) scale(0.6);
          animation: aquecimentoLupa 15s ease-in-out infinite;
        }

        .aquecimento-lupa::after {
          content: '';
          position: absolute;
          right: -12%;
          bottom: -16%;
          width: 16%;
          height: 26%;
          background: #0b1a3a;
          border-radius: 6px;
          transform: rotate(45deg);
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        }

        @keyframes aquecimentoLupa {
          0%   { opacity: 0; left: 48%; top: 62%; background-position: 48% 62%; transform: translate(-50%, -50%) scale(0.6); }
          4%   { opacity: 1; left: 48%; top: 62%; background-position: 48% 62%; transform: translate(-50%, -50%) scale(1); }
          12%  { left: 21%; top: 34%; background-position: 21% 34%; transform: translate(-50%, -50%) scale(1); }
          22%  { left: 60%; top: 70%; background-position: 60% 70%; transform: translate(-50%, -50%) scale(1); }
          32%  { left: 80%; top: 16%; background-position: 80% 16%; transform: translate(-50%, -50%) scale(1); }
          40%  { left: 48%; top: 62%; background-position: 48% 62%; opacity: 1; transform: translate(-50%, -50%) scale(1); }
          44%  { opacity: 0; left: 48%; top: 62%; background-position: 48% 62%; transform: translate(-50%, -50%) scale(0.6); }
          100% { opacity: 0; left: 48%; top: 62%; background-position: 48% 62%; transform: translate(-50%, -50%) scale(0.6); }
        }

        @media (max-width: 720px) {
          .aquecimento-logos { width: 55%; left: 4%; bottom: 2.5%; gap: 3% 5%; }
          .aquecimento-lupa { width: 40%; }
        }
      `}</style>
    </div>
  );
}
