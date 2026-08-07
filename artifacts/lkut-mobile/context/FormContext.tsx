import React, { createContext, useContext, useState } from 'react';
import { LkutFormData, DEFAULT_FORM } from '@/lib/types';

interface FormContextValue {
  data: LkutFormData;
  setField: (field: keyof LkutFormData, value: number | string | boolean | null) => void;
  reset: () => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export function FormProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LkutFormData>({ ...DEFAULT_FORM });

  const setField = (field: keyof LkutFormData, value: number | string | boolean | null) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const reset = () => setData({ ...DEFAULT_FORM });

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
