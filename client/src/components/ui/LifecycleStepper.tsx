import "./ui.css";

export interface LifecycleStepperProps {
  steps: string[];
  currentStep: string;
}

export function LifecycleStepper({ steps, currentStep }: LifecycleStepperProps) {
  return (
    <ol className="lifecycle-stepper" aria-label="Lifecycle progress">
      {steps.map((step) => (
        <li key={step} className="lifecycle-stepper__step" aria-current={step === currentStep ? "step" : undefined}>
          {step}
        </li>
      ))}
    </ol>
  );
}
