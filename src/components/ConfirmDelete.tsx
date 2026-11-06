import { useState } from 'react';

type Props = { label: string; onConfirm: () => Promise<void> };

/** Apagar exige confirmação explícita (sem diálogos nativos). */
export function ConfirmDelete({ label, onConfirm }: Props) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking)
    return (
      <button type="button" className="link danger" onClick={() => setAsking(true)} aria-label={`Apagar ${label}`}>
        Apagar
      </button>
    );
  return (
    <span className="confirm" role="group" aria-label={`Confirmar apagar ${label}`}>
      <button
        type="button"
        className="danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        Confirmar apagar
      </button>
      <button type="button" className="link" onClick={() => setAsking(false)}>
        Cancelar
      </button>
    </span>
  );
}
