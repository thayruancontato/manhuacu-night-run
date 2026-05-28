import { useState, useEffect, useRef } from 'react';
import { X, Trophy, User, Gift, Share, Download, Loader2, Award, Zap, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';
import { LogoCombo } from './LogoCombo';
import { useNavigate } from 'react-router-dom';

interface WinnerExperienceProps {
  atletaNome: string;
  premioNome: string;
  premioImagem: string;
  atletaFoto: string;
  onClose?: () => void;
  onImageGenerated?: (dataUrl: string) => void;
  isSimulacao: boolean;
}

export default function WinnerExperience({ atletaNome, premioNome, premioImagem, atletaFoto, onClose, onImageGenerated, isSimulacao }: WinnerExperienceProps) {
  const [stage, setStage] = useState(0); // 0: Suspense, 1: Reveal
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImg, setGeneratedImg] = useState<string | null>(null);
  const hiddenCardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const primeiroNome = atletaNome.split(' ')[0];

  useEffect(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(500);
    }

    const genTimer = setTimeout(() => {
      generateFinalImage();
    }, 100);

    const revealTimer = setTimeout(() => {
      setStage(1);
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
      triggerConfetti();
    }, 1800);

    return () => {
      clearTimeout(genTimer);
      clearTimeout(revealTimer);
      confetti.reset();
    };
  }, []);

  const generateFinalImage = async () => {
    if (!hiddenCardRef.current) return;
    
    try {
      setIsGenerating(true);
      await new Promise(r => setTimeout(r, 400));

      const canvas = await html2canvas(hiddenCardRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#070D1E',
        logging: false,
        width: 450,
        height: 800
      });

      const dataUrl = canvas.toDataURL('image/png', 1.0);
      setGeneratedImg(dataUrl);
      if (onImageGenerated) onImageGenerated(dataUrl);
    } catch (err) {
      console.error('Error auto-generating image:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      zIndex: 2000000,
    });
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 2000000 };
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);
      confetti({ ...defaults, particleCount: 20, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount: 20, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 1000);

    return () => clearInterval(interval);
  };

  const handleShare = async () => {
    if (!generatedImg) return;
    try {
      const response = await fetch(generatedImg);
      const blob = await response.blob();
      const file = new File([blob], `MCU_Winner.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'MCU Night Run!', text: 'Ganhei um prêmio! 🏆' });
      } else {
        const link = document.createElement('a');
        link.href = generatedImg;
        link.download = `MCU_Winner.png`;
        link?.click();
      }
    } catch (err) { console.error(err); }
  };

  const handleFinalAction = () => {
    if (isSimulacao) {
      onClose?.();
    } else {
      navigate('/atleta/dashboard');
    }
  };

  return (
    <div className="winner-overlay">
      {/* Hidden Artboard */}
      <div 
        ref={hiddenCardRef} 
        className="story-artboard-clean-v2" 
        style={{ position: 'absolute', left: '-9999px' }}
      >
        {/* Fundo com confetti/efeitos (sem textos) */}
        <img src="/fundo-premio.png" alt="" crossOrigin="anonymous" className="tpl-bg-img" />
        {/* Overlay sutil para escurecer levemente */}
        <div className="tpl-dark-overlay" />
        
        {/* Conteúdo completo por cima */}
        <div className="tpl-content">
          {/* Header */}
          <span className="tpl-congrats">PARABÉNS PELA VITÓRIA</span>
          <h2 className="tpl-name">{primeiroNome.toUpperCase()}!</h2>
          <div className="tpl-highlight-bar">
            <span>VOCÊ GANHOU UM PRÊMIO SURPRESA!</span>
          </div>

          {/* Imagem do Prêmio */}
          <div className="tpl-prize-frame">
            {premioImagem ? (
              <img src={premioImagem} alt="Premio" crossOrigin="anonymous" className="tpl-prize-img" />
            ) : (
              <Trophy size={100} color="#6BFF2A" />
            )}
          </div>

          {/* Nome do Prêmio */}
          <div className="tpl-prize-label">
            <Gift size={16} color="#6BFF2A" />
            <span className="tpl-prize-name">{premioNome.toUpperCase()}</span>
          </div>

          {/* Vencedor + Foto */}
          <span className="tpl-winner-label">★ VENCEDOR(A) ★</span>
          <div className="tpl-athlete-circle">
            {atletaFoto ? (
              <img src={atletaFoto} alt="Atleta" crossOrigin="anonymous" className="tpl-athlete-img" />
            ) : (
              <div className="tpl-athlete-placeholder"><User size={36} color="#6BFF2A" /></div>
            )}
          </div>

          {/* Agradecimento */}
          <div className="tpl-thanks-card">
            <span className="tpl-thanks-icon">🎉</span>
            <div className="tpl-thanks-text">
              <strong>OBRIGADO POR FAZER</strong><br />
              <strong><em>PARTE DA NOSSA CORRIDA!</em></strong>
            </div>
          </div>

          {/* Logo */}
          <img src="/LOGO NIGHT RUN SEM FUNDO (em amarelo).png" alt="MCU Night Run" crossOrigin="anonymous" className="tpl-logo-main" />

          {/* Parceiros */}
          <div className="tpl-partners">
            <div className="tpl-partner">
              <span className="tpl-partner-lbl">REALIZAÇÃO</span>
              <img src="/logo-mcu.png" alt="MCU" crossOrigin="anonymous" className="tpl-partner-img" />
            </div>
            <div className="tpl-partner">
              <span className="tpl-partner-lbl">APOIO</span>
              <img src="/logo-ademare.png" alt="Grupo MCU" crossOrigin="anonymous" className="tpl-partner-img" />
            </div>
          </div>

          <div className="tpl-handle">@MCUNIGHTRUN</div>
        </div>
      </div>

      {stage === 0 ? (
        <div className="suspense-screen admin-form-animated">
          <div className="suspense-loader">
             <div className="loader-ring" />
             <Gift size={60} color="#6BFF2A" className="pulse-gentle" />
          </div>
          <h2 className="suspense-text">PREPARE-SE...</h2>
          <p className="suspense-subtext">Algo especial para você!</p>
        </div>
      ) : (
        <div className="winner-result-container admin-form-animated">
          <div className="display-frame-clean">
             {generatedImg ? (
               <img src={generatedImg} alt="Resultado" className="story-final-render" />
             ) : (
               <div className="render-loading-clean">
                  <Loader2 size={50} className="spin" color="#6BFF2A" />
                  <p>REVELANDO PRÊMIO...</p>
               </div>
             )}
          </div>

          <div className="share-warning-banner">
            <div className="share-warning-icon">⚠️</div>
            <p className="share-warning-text">Para retirar seu prêmio, é <strong>obrigatório</strong> compartilhar esta imagem nos seus Stories marcando <strong>@mcunightrun</strong></p>
          </div>

          <div className="actions-row-clean">
            <button onClick={handleShare} className="btn-insta-share-clean" disabled={!generatedImg}>
              <Share size={20} /> COMPARTILHAR STORIES
            </button>
            <button onClick={handleFinalAction} className="btn-close-clean">
               {isSimulacao ? 'CONCLUIR SIMULAÇÃO' : 'IR PARA ÁREA DO ATLETA'} <ArrowRight size={20} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        .winner-overlay {
          position: fixed; inset: 0; z-index: 999999;
          background: #070D1E; display: flex; align-items: center;
          justify-content: center; padding: 15px; overflow: hidden;
          font-family: 'Montserrat', sans-serif;
        }

        .suspense-screen { text-align: center; color: #fff; }
        .suspense-loader { position: relative; width: 120px; height: 120px; margin: 0 auto 30px; display: flex; align-items: center; justify-content: center; }
        .loader-ring { position: absolute; inset: 0; border: 4px solid rgba(107,255,42,0.1); border-top-color: #6BFF2A; border-radius: 50%; animation: spin 1s linear infinite; }
        .suspense-text { font-size: 2.8rem; font-weight: 950; color: #6BFF2A; letter-spacing: -2px; }

        /* === ARTBOARD === */
        .story-artboard-clean-v2 { width: 450px; height: 800px; position: relative; overflow: hidden; background: #070D1E; }
        .tpl-bg-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; opacity: 0.85; }
        .tpl-dark-overlay { position: absolute; inset: 0; z-index: 1; background: rgba(7,13,30,0.35); }

        /* Conteúdo flex vertical */
        .tpl-content {
          position: relative; z-index: 10; height: 100%;
          display: flex; flex-direction: column; align-items: center;
          padding: 25px 28px 18px;
        }

        /* Header */
        .tpl-congrats { color: #6BFF2A; font-size: 0.7rem; font-weight: 900; letter-spacing: 4px; font-style: italic; margin-bottom: 2px; }
        .tpl-name { color: #fff; font-size: 3.2rem; font-weight: 950; margin: 0; font-style: italic; letter-spacing: -2px; line-height: 1; text-shadow: 0 3px 15px rgba(0,0,0,0.5); }
        .tpl-highlight-bar { background: #6BFF2A; padding: 5px 22px; margin-top: 6px; margin-bottom: 14px; display: inline-block; transform: skewX(-5deg); }
        .tpl-highlight-bar span { color: #0A1128; font-size: 0.65rem; font-weight: 950; font-style: italic; letter-spacing: 1px; display: block; transform: skewX(5deg); }

        /* Prize Frame */
        .tpl-prize-frame { 
          width: 230px; height: 185px; 
          border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; 
          display: flex; align-items: center; justify-content: center; 
          background: rgba(0,0,0,0.15); margin-bottom: 6px;
        }
        .tpl-prize-img { max-width: 85%; max-height: 85%; object-fit: contain; filter: drop-shadow(0 8px 20px rgba(0,0,0,0.4)); }

        /* Prize Label */
        .tpl-prize-label { 
          display: flex; align-items: center; gap: 10px; 
          background: rgba(10,17,40,0.7); border: 1px solid rgba(255,255,255,0.08); 
          border-radius: 12px; padding: 10px 20px; margin-bottom: 16px;
        }
        .tpl-prize-name { color: #fff; font-size: 0.75rem; font-weight: 900; letter-spacing: 0.5px; line-height: 1.3; text-align: center; }

        /* Winner Section */
        .tpl-winner-label { color: #6BFF2A; font-size: 0.55rem; font-weight: 900; letter-spacing: 4px; margin-bottom: 6px; }
        .tpl-athlete-circle { 
          width: 105px; height: 105px; border-radius: 50%; 
          border: 3px solid #6BFF2A; overflow: hidden; 
          margin-bottom: 12px; flex-shrink: 0;
        }
        .tpl-athlete-img { width: 100%; height: 100%; object-fit: cover; }
        .tpl-athlete-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #071A45; }

        /* Thanks Card */
        .tpl-thanks-card { 
          display: flex; align-items: center; gap: 12px; 
          background: rgba(10,17,40,0.65); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px; padding: 12px 20px; 
          margin-bottom: 14px; width: 88%;
        }
        .tpl-thanks-icon { font-size: 1.4rem; flex-shrink: 0; }
        .tpl-thanks-text { color: #fff; font-size: 0.8rem; font-weight: 900; font-style: italic; line-height: 1.35; }

        /* Logo */
        .tpl-logo-main { height: 45px; margin-bottom: 10px; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.3)); }

        /* Partners */
        .tpl-partners { display: flex; align-items: center; gap: 25px; margin-bottom: 6px; }
        .tpl-partner { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .tpl-partner-lbl { color: rgba(255,255,255,0.35); font-size: 0.38rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
        .tpl-partner-img { height: 18px; filter: brightness(0) invert(1); opacity: 0.6; }

        /* Handle */
        .tpl-handle { color: rgba(255,255,255,0.25); font-size: 0.65rem; font-weight: 950; letter-spacing: 4px; margin-top: auto; }

        /* === RESULT SCREEN === */
        .winner-result-container { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .display-frame-clean { width: 100%; max-width: 400px; aspect-ratio: 9/16; border-radius: 0px; overflow: hidden; background: #070D1E; box-shadow: 0 40px 100px rgba(0,0,0,0.9); border: 1px solid rgba(255,255,255,0.05); position: relative; z-index: 10; }
        .story-final-render { width: 100%; height: 100%; object-fit: contain; }
        .render-loading-clean { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #6BFF2A; gap: 20px; font-weight: 900; }
        .actions-row-clean { width: 100%; max-width: 400px; margin-top: 25px; display: flex; flex-direction: column; gap: 10px; position: relative; z-index: 10; }
        .btn-insta-share-clean { background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); color: #fff; border: none; padding: 18px; border-radius: 12px; font-weight: 900; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; }
        .btn-close-clean { background: #6BFF2A; color: #000; border: none; padding: 18px; border-radius: 12px; font-weight: 950; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; }

        /* Banner de aviso */
        .share-warning-banner { width: 100%; max-width: 400px; margin-top: 15px; background: rgba(107,255,42,0.08); border: 1px solid rgba(107,255,42,0.3); border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; gap: 12px; position: relative; z-index: 10; }
        .share-warning-icon { font-size: 1.4rem; flex-shrink: 0; }
        .share-warning-text { color: rgba(255,255,255,0.85); font-size: 0.8rem; font-weight: 600; margin: 0; line-height: 1.4; }
        .share-warning-text strong { color: #6BFF2A; font-weight: 900; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        @keyframes pulse-gentle { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.05); opacity: 1; } }
        .pulse-gentle { animation: pulse-gentle 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
