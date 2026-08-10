import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LkutFormData, DEFAULT_FORM } from '@/lib/types';

const STORAGE_KEY = '@lkut_form_data';

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
          const parsed = JSON.parse(raw) as Partial<LkutFormData>;
          setData({ ...DEFAULT_FORM, ...parsed });
        } catch {
          // Corrupted data — fall back to defaults silently
        }
      }
    });
  }, []);

  const setField = (field: keyof LkutFormData, value: number | string | boolean | null) => {
    setData((prev) => {
      const next = { ...prev, [field]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
