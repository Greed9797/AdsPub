import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

/** Rótulo, controle e dica ligados por `for` e `aria-describedby`. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const generatedID = useId();
  const element = isValidElement(children)
    ? (children as ReactElement<{ id?: string; 'aria-describedby'?: string }>)
    : undefined;
  const inputID = element?.props.id ?? generatedID;
  const descriptionID = hint ? `${inputID}-description` : undefined;
  const control = element
    ? cloneElement(element, {
        id: inputID,
        'aria-describedby':
          [element.props['aria-describedby'], descriptionID].filter(Boolean).join(' ') || undefined,
      })
    : children;
  return (
    <div className={className ? `ap-field ${className}` : 'ap-field'}>
      <label className="ap-field__label ap-t-body-strong" htmlFor={inputID}>
        {label}
      </label>
      {control}
      {hint ? (
        <p className="ap-field__hint ap-t-small" id={descriptionID}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass = 'ap-input';
