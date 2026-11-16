import { useRef, useState, type FormEvent } from 'react';
import type { Profile } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { Field } from '../components/Field.tsx';
import { ConfirmDelete } from '../components/ConfirmDelete.tsx';

type Props = { profiles: Profile[]; onChanged: () => Promise<void> };

export function ProfilesView({ profiles, onChanged }: Props) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  function fail(msg: string) {
    setError(msg);
    queueMicrotask(() => errorRef.current?.focus());
  }

  function reset() {
    setName('');
    setEditingId(undefined);
    setFieldError(undefined);
    setError(undefined);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (clean === '' || clean.length > 60) {
      setFieldError('Indica o nome do perfil (1–60 caracteres).');
      return fail('Corrige os campos assinalados.');
    }
    setFieldError(undefined);
    setSaving(true);
    try {
      if (editingId === undefined) await api.saveProfile({ name: clean });
      else await api.saveProfile({ name: clean }, editingId);
      await onChanged();
      reset();
    } catch (err) {
      fail(err instanceof ApiError ? err.message : 'Ocorreu um erro. Tenta novamente.');
    } finally {
      setSaving(false);
    }
  }

  function edit(p: Profile) {
    setEditingId(p.id);
    setName(p.name);
    setFieldError(undefined);
    setError(undefined);
  }

  return (
    <section aria-labelledby="profiles-title">
      <h2 id="profiles-title">Perfis</h2>
      <p className="muted-text">
        Esta é a lista de perfis que os consultores podem escolher. Todos ficam com o mesmo nome. Ao renomear um perfil, os
        consultores que o usam passam automaticamente para o novo nome.
      </p>
      <form onSubmit={submit} noValidate className="card form-grid">
        <h3>{editingId === undefined ? 'Novo perfil' : 'Renomear perfil'}</h3>
        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">
            {error}
          </p>
        )}
        <Field label="Nome do perfil" hint="Ex.: Big Data Pleno" error={fieldError}>
          {(c) => <input {...c} name="profileName" type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'A guardar…' : editingId === undefined ? 'Adicionar perfil' : 'Guardar nome'}
          </button>
          {editingId !== undefined && (
            <button type="button" onClick={reset}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {profiles.length === 0 ? (
        <p className="empty">Ainda não há perfis. Adiciona o primeiro no formulário acima.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Perfis disponíveis para os consultores</caption>
            <thead>
              <tr>
                <th scope="col">Perfil</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.name}</th>
                  <td className="row-actions">
                    <button type="button" className="link" onClick={() => edit(p)} aria-label={`Renomear ${p.name}`}>
                      Renomear
                    </button>
                    <ConfirmDelete
                      label={p.name}
                      onConfirm={async () => {
                        try {
                          await api.deleteProfile(p.id);
                          await onChanged();
                        } catch (err) {
                          fail(err instanceof ApiError ? err.message : 'Ocorreu um erro.');
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
