import React from 'react';

interface LogoComboProps {
  className?: string;
  style?: React.CSSProperties;
  variant?: 'light' | 'dark';
  hideMainLogo?: boolean;
  noBackground?: boolean;
}

export const LogoCombo: React.FC<LogoComboProps> = ({ 
  className, 
  style, 
  variant = 'light',
  hideMainLogo = false,
  noBackground = true
}) => {
  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center', 
    justifyContent: 'center',
    gap: '15px',
    background: 'transparent',
    ...style
  };

  const partnersBoxStyle: React.CSSProperties = {
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: '18px',
    background: noBackground ? 'transparent' : '#fff',
    padding: noBackground ? '0' : '8px 22px',
    borderRadius: noBackground ? '0' : '12px',
    boxShadow: noBackground ? 'none' : '0 4px 12px rgba(0,0,0,0.12)',
    height: hideMainLogo ? '100%' : '35%',
    opacity: 0.98
  };

  return (
    <div className={`logo-combo-wrapper ${className || ''}`} style={containerStyle}>
      {/* Top Line: Main Logo - FLOATING OUTSIDE */}
      {!hideMainLogo && (
        <div style={{ height: '55%', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <img 
            src="/LOGO horizontal NIGHT RUN SEM FUNDO (em amarelo e branco).png" 
            alt="MCU Night Run" 
            style={{ height: '115%', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' }} 
          />
        </div>
      )}

      {/* Partners Row - INSIDE THE BOX */}
      <div style={partnersBoxStyle}>
        <img 
          src="/logo-mcu.png" 
          alt="Prefeitura de Manhuaçu" 
          style={{ height: '100%', maxWidth: '150px', objectFit: 'contain' }} 
        />

        <div style={{ width: '1.5px', height: '60%', background: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />

        <img 
          src="/logo-ademare.png" 
          alt="Ademare" 
          style={{ height: '100%', maxWidth: '150px', objectFit: 'contain' }} 
        />
      </div>

      <style>{`
        .logo-combo-wrapper {
          min-height: ${hideMainLogo ? '30px' : '100px'}; 
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
};
