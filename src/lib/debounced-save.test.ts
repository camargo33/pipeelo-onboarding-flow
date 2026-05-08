import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDebouncedAutosave } from './debounced-save';

describe('useDebouncedAutosave', () => {
  it('chama saver após delay', async () => {
    vi.useFakeTimers();
    const saver = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedAutosave(v, saver, 500),
      { initialProps: { v: 'a' } }
    );
    rerender({ v: 'b' });
    expect(saver).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(saver).toHaveBeenCalledWith('b');
    vi.useRealTimers();
  });

  it('cancela timer anterior em re-input', async () => {
    vi.useFakeTimers();
    const saver = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedAutosave(v, saver, 500),
      { initialProps: { v: 'a' } }
    );
    rerender({ v: 'b' });
    await vi.advanceTimersByTimeAsync(300);
    rerender({ v: 'c' });
    await vi.advanceTimersByTimeAsync(300);
    expect(saver).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(saver).toHaveBeenCalledWith('c');
    vi.useRealTimers();
  });

  it('não duplica saves para mesmo valor', async () => {
    vi.useFakeTimers();
    const saver = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedAutosave(v, saver, 500),
      { initialProps: { v: 'a' } }
    );
    rerender({ v: 'b' });
    await vi.advanceTimersByTimeAsync(500);
    rerender({ v: 'b' });
    await vi.advanceTimersByTimeAsync(500);
    expect(saver).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('respeita enabled=false', async () => {
    vi.useFakeTimers();
    const saver = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedAutosave(v, saver, 500, false),
      { initialProps: { v: 'a' } }
    );
    rerender({ v: 'b' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(saver).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
