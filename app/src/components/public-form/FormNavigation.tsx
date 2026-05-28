interface FormNavigationProps {
  currentStep: number;
  totalSteps: number;
  isValid: boolean;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

export const FormNavigation = ({ 
  currentStep, 
  totalSteps, 
  isValid, 
  loading, 
  onPrev, 
  onNext, 
  onSubmit 
}: FormNavigationProps) => {
  return (
    <div className="form-navigation">
      {currentStep > 1 && (
        <button className="btn-nav btn-prev" onClick={onPrev} disabled={loading}>
          Voltar
        </button>
      )}
      <div style={{ flex: 1 }} />
      {currentStep < totalSteps ? (
        <button 
          className="btn-nav btn-next" 
          onClick={onNext} 
          disabled={!isValid || loading}
        >
          Próximo
        </button>
      ) : (
        <button 
          className="btn-nav btn-submit" 
          onClick={onSubmit} 
          disabled={!isValid || loading}
        >
          {loading ? 'Aguarde...' : 'FINALIZAR'}
        </button>
      )}
    </div>
  );
};
