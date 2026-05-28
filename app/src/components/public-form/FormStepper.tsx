interface FormStepperProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
  onStepClick: (step: number) => void;
}

export const FormStepper = ({ currentStep, totalSteps, stepLabels, onStepClick }: FormStepperProps) => {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className="progress-bar-minimal">
      <div className="progress-steps-list">
        {steps.map(i => (
          <div 
            key={i} 
            className={`minimal-step ${currentStep === i ? 'active' : currentStep > i ? 'completed' : ''}`} 
            onClick={() => currentStep > i && onStepClick(i)}
          >
            <div className="step-num">{currentStep > i ? '✓' : i}</div>
            <div className="step-txt">{stepLabels[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
