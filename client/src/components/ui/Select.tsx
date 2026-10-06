import { useId } from "react";
import type { SelectHTMLAttributes } from "react";
import "./ui.css";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

/** Native select with the same label/focus styling as TextField (keeps built-in keyboard and a11y behaviour). */
export function Select({ label, id, className, children, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className={`text-field${className ? ` ${className}` : ""}`}>
      <label className="text-field__label" htmlFor={selectId}>
        {label}
      </label>
      <select id={selectId} className="text-field__input" {...rest}>
        {children}
      </select>
    </div>
  );
}
