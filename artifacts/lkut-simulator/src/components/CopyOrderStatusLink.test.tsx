import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { CopyOrderStatusLink } from './CopyOrderStatusLink';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer;

afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function renderButton(clipboard: unknown, base = '/') {
  vi.stubEnv('BASE_URL', base);
  vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
  vi.stubGlobal('navigator', { clipboard });
  await act(async () => {
    renderer = TestRenderer.create(<CopyOrderStatusLink orderId="order/id ?&" />);
  });
  return renderer.root.findByType('button');
}

describe('copy order status link', () => {
  it.each(['/', '/apps/lkut/'])('copies an absolute link at base %s and announces success', async base => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const button = await renderButton({ writeText }, base);
    expect(button.props.type).toBe('button');
    expect(button.findByType('svg').props['aria-hidden']).toBe('true');
    await act(async () => button.props.onClick());
    expect(writeText).toHaveBeenCalledWith(
      `https://example.test${base}cek-pesanan?id=order%2Fid%20%3F%26`,
    );
    expect(renderer.root.findByProps({ role: 'status' }).children.join(''))
      .toBe('Tautan status pesanan berhasil disalin.');
    expect(renderer.root.findAllByType('input')).toHaveLength(0);
  });

  it.each(['rejected', 'unavailable'])('offers a labeled manual link when clipboard is %s', async mode => {
    const writeText = vi.fn().mockRejectedValue(new Error('Denied'));
    const button = await renderButton(mode === 'rejected' ? { writeText } : undefined);
    await act(async () => button.props.onClick());
    expect(renderer.root.findByProps({ role: 'status' }).children.join(''))
      .toContain('Tautan gagal disalin otomatis');
    const input = renderer.root.findByType('input');
    expect(input.parent?.type).toBe('label');
    expect(input.props.readOnly).toBe(true);
    expect(input.props.value).toBe('https://example.test/cek-pesanan?id=order%2Fid%20%3F%26');
    const select = vi.fn();
    input.props.onFocus({ currentTarget: { select } });
    expect(select).toHaveBeenCalledOnce();

    // A retry must replace the error, not leave contradictory feedback.
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await act(async () => button.props.onClick());
    expect(renderer.root.findAllByType('input')).toHaveLength(0);
    expect(renderer.root.findByProps({ role: 'status' }).children.join('')).toContain('berhasil disalin');
  });

  it('shows pending feedback until copying finishes', async () => {
    let resolveCopy!: () => void;
    const button = await renderButton({
      writeText: () => new Promise<void>(resolve => { resolveCopy = resolve; }),
    });
    let pending: Promise<void>;
    await act(async () => { pending = button.props.onClick(); });
    expect(button.props.disabled).toBe(true);
    expect(button.children.join('')).toContain('Menyalin tautan');
    await act(async () => { resolveCopy(); await pending; });
    expect(button.props.disabled).toBe(false);
  });
});
