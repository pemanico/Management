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
      setFieldError('Enter the profile name (1–60 characters).');
      return fail('Fix the highlighted fields.');
    }
    setFieldError(undefined);
    setSaving(true);
    try {
      if (editingId === undefined) await api.saveProfile({ name: clean });
      else await api.saveProfile({ name: clean }, editingId);
      await onChanged();
      reset();
    } catch (err) {
      fail(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
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
      <h2 id="profiles-title">Profiles</h2>
      <p className="muted-text">
        This is the list of profiles consultants can be given, so everyone uses the same names. Renaming a profile
        also renames it on the consultants that use it.
      </p>
      <form onSubmit={submit} noValidate className="card form-grid">
        <h3>{editingId === undefined ? 'New profile' : 'Rename profile'}</h3>
        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="error banner">
            {error}
          </p>
        )}
        <Field label="Profile name" hint="E.g. Big Data Mid-level" error={fieldError}>
          {(c) => <input {...c} name="profileName" type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : editingId === undefined ? 'Add profile' : 'Save name'}
          </button>
          {editingId !== undefined && (
            <button type="button" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {profiles.length === 0 ? (
        <p className="empty">No profiles yet. Add the first one in the form above.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Profiles available to consultants</caption>
            <thead>
              <tr>
                <th scope="col">Profile</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.name}</th>
                  <td className="row-actions">
                    <button type="button" className="link" onClick={() => edit(p)} aria-label={`Rename ${p.name}`}>
                      Rename
                    </button>
                    <ConfirmDelete
                      label={p.name}
                      onConfirm={async () => {
                        try {
                          await api.deleteProfile(p.id);
                          await onChanged();
                        } catch (err) {
                          fail(err instanceof ApiError ? err.message : 'Something went wrong.');
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
