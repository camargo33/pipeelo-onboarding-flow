import { useEffect, useRef } from 'react';

/**
 * Hook de autosave debounced (HARD-02).
 *
 * - Agenda `saver(value)` após `delayMs` (default 500ms).
 * - Cancela timer pendente em re-input.
 * - Não duplica saves para o mesmo valor (Object.is).
 * - Em `pagehide`, faz best-effort flush via saver com `keepalive: true`
 *   (mitigação Pitfall 6 — autosave race com unload).
 */
export function useDebouncedAutosave<T>(
  value: T,
  saver: (v: T) => Promise<void>,
  delayMs = 500,
  enabled = true
) {
  const lastSavedRef = useRef<T | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    if (Object.is(value, lastSavedRef.current)) return;

    pendingValueRef.current = value;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        await saver(value);
        lastSavedRef.current = value;
        pendingValueRef.current = undefined;
      } catch (e) {
        // Não perdemos o input — value continua em state, próximo change re-tenta.
        // eslint-disable-next-line no-console
        console.error('[autosave] failed', e);
      }
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, saver, delayMs, enabled]);

  // Flush em pagehide via saver (api-client já manda keepalive:true).
  useEffect(() => {
    const flush = () => {
      const pending = pendingValueRef.current;
      if (pending !== undefined && !Object.is(pending, lastSavedRef.current)) {
        // best-effort: request continua mesmo com tab fechando
        saver(pending).catch(() => {
          /* ignore — keepalive já garantiu envio */
        });
      }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [saver]);
}
