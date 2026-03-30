import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';

function readPersistentValue<T>(key: string, initialValue: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : initialValue;
  } catch {
    return initialValue;
  }
}

function readPersistentValueWithLegacyFallback<T>(key: string, legacyKey: string | null, initialValue: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as T;
    }

    if (!legacyKey) {
      return initialValue;
    }

    const legacyStored = window.localStorage.getItem(legacyKey);
    if (!legacyStored) {
      return initialValue;
    }

    const parsed = JSON.parse(legacyStored) as T;
    window.localStorage.setItem(key, JSON.stringify(parsed));
    window.localStorage.removeItem(legacyKey);
    return parsed;
  } catch {
    return initialValue;
  }
}

export function buildScopedStorageKey(baseKey: string, scopeKey?: string | null) {
  const normalizedScope = scopeKey?.trim();
  return normalizedScope ? `${baseKey}::${normalizedScope}` : baseKey;
}

export function usePersistentState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readPersistentValue(key, initialValue));
  const hydratedKeyRef = useRef(key);

  useEffect(() => {
    if (hydratedKeyRef.current === key) {
      return;
    }

    hydratedKeyRef.current = key;
    setValue(readPersistentValue(key, initialValue));
  }, [initialValue, key]);

  useEffect(() => {
    if (hydratedKeyRef.current !== key) {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage failures in rebuild shell.
    }
  }, [key, value]);

  return [value, setValue];
}

export function useScopedPersistentState<T>(
  baseKey: string,
  scopeKey: string | null | undefined,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const scopedKey = buildScopedStorageKey(baseKey, scopeKey);
  const legacyKey = scopeKey?.trim() ? baseKey : null;
  const [value, setValue] = useState<T>(() => readPersistentValueWithLegacyFallback(scopedKey, legacyKey, initialValue));
  const hydratedKeyRef = useRef(scopedKey);

  useEffect(() => {
    if (hydratedKeyRef.current === scopedKey) {
      return;
    }

    hydratedKeyRef.current = scopedKey;
    setValue(readPersistentValueWithLegacyFallback(scopedKey, legacyKey, initialValue));
  }, [initialValue, legacyKey, scopedKey]);

  useEffect(() => {
    if (hydratedKeyRef.current !== scopedKey) {
      return;
    }

    try {
      window.localStorage.setItem(scopedKey, JSON.stringify(value));
    } catch {
      // Ignore storage failures in rebuild shell.
    }
  }, [scopedKey, value]);

  return [value, setValue];
}
