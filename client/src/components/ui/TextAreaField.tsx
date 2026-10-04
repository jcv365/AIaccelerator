import { useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import "./ui.css";

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

/** Textarea counterpart to TextField, sharing the same .text-field styling. */
export function TextAreaField({ label, error, id, className, ...rest }: TextAreaFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={`text-field${error ? " text-field--error" : ""}${className ? ` ${className}` : ""}`}>
      <label className="text-field__label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
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
