import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LkutFormData, DEFAULT_FORM } from '@/lib/types';

const STORAGE_KEY = '@lkut_form_data';

/**
 * Increment this constant whenever LkutFormData fields are added, renamed, or
 * removed. On restore, a version mismatch causes the stale data to be discarded
 * and defaults to be used instead, preventing silent corruption.
 */
const STORAGE_VERSION = 1;

interface PersistedStore {
  version: number;
  data: Partial<LkutFormData>;
}

interface FormContextValue {
  data: LkutFormData;
  setField: (field: keyof LkutFormData, value: number | string | boolean | null) => void;
  reset: () => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export function FormProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LkutFormData>({ ...DEFAULT_FORM });

  // Restore persisted data on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);

          // Legacy format: plain LkutFormData written before versioning was added.
          // Migrate by preserving all user values and filling any new fields from
          // DEFAULT_FORM, then immediately re-save in the versioned envelope.
          if (typeof parsed === 'object' && parsed !== null && !('version' in parsed)) {
            const migrated: LkutFormData = { ...DEFAULT_FORM, ...(parsed as Partial<LkutFormData>) };
            setData(migrated);
            const store: PersistedStore = { version: STORAGE_VERSION, data: migrated };
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
            return;
          }

          const store = parsed as PersistedStore;
          // Merge saved data over defaults so any new fields added to DEFAULT_FORM
          // are always present even in old persisted records. Bumping STORAGE_VERSION
          // is reserved for destructive/incompatible schema changes that cannot be
          // forward-merged safely — in those cases add an explicit migration branch
          // above rather than silently discarding user data.
          const restored: LkutFormData = { ...DEFAULT_FORM, ...store.data };
          setData(restored);

          // Re-save with the current version so future reads see a clean envelope.
          if (store.version !== STORAGE_VERSION) {
            AsyncStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ version: STORAGE_VERSION, data: restored } as PersistedStore),
            );
          }
        } catch {
          // Corrupted / unparseable data — fall back to defaults silently
        }
      }
    });
  }, []);

  const setField = (field: keyof LkutFormData, value: number | string | boolean | null) => {
    setData((prev) => {
      const next = { ...prev, [field]: value };
      const store: PersistedStore = { version: STORAGE_VERSION, data: next };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return next;
    });
  };

  const reset = () => {
    AsyncStorage.removeItem(STORAGE_KEY);
    setData({ ...DEFAULT_FORM });
  };

  return (
    <FormContext.Provider value={{ data, setField, reset }}>
      {children}
    </FormContext.Provider>
  );
}

export function useForm() {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error('useForm must be used within FormProvider');
  return ctx;
}
