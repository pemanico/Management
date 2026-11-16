import { useId, type ReactNode } from 'react';

type ControlProps = { id: string; 'aria-describedby': string | undefined; 'aria-invalid': boolean };

type Props = {
  label: string;
  hint?: string;
  error?: string | undefined;
  wide?: boolean; // ocupa a linha toda do formulário (textos longos)
  children: (control: ControlProps) => ReactNode;
};

/** Label clicável + dica + erro ligados ao controlo via aria-describedby. */
export function Field({ label, hint, error, wide, children }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={wide ? 'field wide' : 'field'}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) })}
      {hint && (
        <small id={hintId} className="hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={errorId} className="error">
          {error}
        </small>
      )}
    </div>
  );
}
