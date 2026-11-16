import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

// Rascunhos de formulário que sobrevivem a fechar e reabrir separadores e o browser (localStorage, partilhado entre separadores da mesma origem).
// Só para rascunhos de formulário: nunca guarda o que já foi gravado na base de dados.
export function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed = JSON.parse(raw) as T;
      // Mescla com o valor inicial: um rascunho antigo sem campos novos não deixa campos undefined.
      if (typeof initial === 'object' && initial !== null && !Array.isArray(initial) && typeof parsed === 'object' && parsed !== null) {
        return { ...initial, ...parsed };
      }
      return parsed;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      if (value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Armazenamento cheio ou bloqueado: a vista continua a funcionar sem persistência.
    }
  }, [key, value]);

  return [value, setValue];
}
