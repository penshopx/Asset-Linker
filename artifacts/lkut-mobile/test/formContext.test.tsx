import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = '@lkut_form_data';
const STORAGE_VERSION = 1;

const storage = vi.hoisted(() => new Map<string, string>());
const mockAsyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: vi.fn(async (key: string) => {
    storage.delete(key);
  }),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: mockAsyncStorage,
}));

import { FormProvider, useForm } from '@/context/FormContext';
import { DEFAULT_FORM, LkutFormData } from '@/lib/types';

// @ts-expect-error React test renderer reads this global in development.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function FormProbe() {
  const { data } = useForm();
  return React.createElement('FormProbe', { testID: 'form-probe', data });
}

async function renderForm() {
  let renderer: ReturnType<typeof create>;

  await act(async () => {
    renderer = create(
      React.createElement(
        FormProvider,
        null,
        React.createElement(FormProbe),
      ),
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  return renderer!;
}

function currentData(renderer: ReturnType<typeof create>): LkutFormData {
  return renderer.root.findByProps({ testID: 'form-probe' }).props.data;
}

describe('FormProvider persisted data migration guard', () => {
  beforeEach(() => {
    storage.clear();
    mockAsyncStorage.getItem.mockClear();
    mockAsyncStorage.setItem.mockClear();
    mockAsyncStorage.removeItem.mockClear();
  });

  it('restores matching-version values and merges missing DEFAULT_FORM fields', async () => {
    const savedValues: Partial<LkutFormData> = {
      kualifikasi: 'Utama',
      assetGrowth: 42,
    };
    storage.set(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, data: savedValues }),
    );

    const renderer = await renderForm();

    expect(currentData(renderer)).toEqual({ ...DEFAULT_FORM, ...savedValues });
    expect(currentData(renderer).hasSmap).toBe(DEFAULT_FORM.hasSmap);
    expect(currentData(renderer).projectScore).toBe(DEFAULT_FORM.projectScore);
  });

  it('preserves values from a mismatched compatible version and upgrades storage', async () => {
    const savedValues: Partial<LkutFormData> = {
      kualifikasi: 'Utama',
      assetGrowth: 99,
      hasSmap: false,
    };
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION + 1,
        data: savedValues,
      }),
    );

    const renderer = await renderForm();

    const expectedData = { ...DEFAULT_FORM, ...savedValues };
    expect(currentData(renderer)).toEqual(expectedData);
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, data: expectedData }),
    );
  });

  it('migrates legacy unversioned data and writes the current envelope', async () => {
    const savedValues: Partial<LkutFormData> = {
      kualifikasi: 'Utama',
      assetGrowth: 0,
      projectScore: 88,
      hasSmap: false,
    };
    storage.set(STORAGE_KEY, JSON.stringify(savedValues));

    const renderer = await renderForm();

    const expectedData = { ...DEFAULT_FORM, ...savedValues };
    expect(currentData(renderer)).toEqual(expectedData);
    expect(currentData(renderer).gpm).toBe(DEFAULT_FORM.gpm);
    expect(currentData(renderer).skkMonthsLeft).toBe(DEFAULT_FORM.skkMonthsLeft);
    expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, data: expectedData }),
    );
    expect(JSON.parse(storage.get(STORAGE_KEY)!)).toEqual({
      version: STORAGE_VERSION,
      data: expectedData,
    });

    await act(async () => renderer.unmount());
    mockAsyncStorage.setItem.mockClear();

    const restoredRenderer = await renderForm();

    expect(currentData(restoredRenderer)).toEqual(expectedData);
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();

    await act(async () => restoredRenderer.unmount());
  });

  it('falls back to defaults when persisted storage is not valid JSON', async () => {
    storage.set(STORAGE_KEY, '{not valid json');

    const renderer = await renderForm();

    expect(currentData(renderer)).toEqual(DEFAULT_FORM);
  });
});