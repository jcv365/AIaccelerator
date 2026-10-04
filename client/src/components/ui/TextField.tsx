import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import "./ui.css";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({ label, error, id, className, ...rest }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={`text-field${error ? " text-field--error" : ""}${className ? ` ${className}` : ""}`}>
      <label className="text-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="text-field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...rest}
      />
      {error && (
        <span className="text-field__error" id={`${inputId}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
