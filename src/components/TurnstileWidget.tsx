import { Turnstile } from '@marsidev/react-turnstile';

type Props = {
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
};

/**
 * Wrapper React do Cloudflare Turnstile (HARD-07 client-side).
 *
 * - Usa `VITE_TURNSTILE_SITE_KEY` (público) — verificação real do token
 *   acontece server-side em `/api/sessions/create` (Plan 04).
 * - Sem siteKey: retorna null e loga warning (modo dev permissivo, NovoOnboarding
 *   trata `turnstileToken === ''` como bypass dev).
 * - `refreshExpired: 'auto'` mitiga Pitfall 5 (token expira em form lento).
 * - Em expiração/erro chama `onSuccess('')` para invalidar o token no estado pai.
 */
export function TurnstileWidget({ onSuccess, onExpire, onError }: Props) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  if (!siteKey) {
    // eslint-disable-next-line no-console
    console.warn('[TurnstileWidget] VITE_TURNSTILE_SITE_KEY ausente — modo dev permissivo');
    return null;
  }
  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={onSuccess}
      onExpire={onExpire ?? (() => onSuccess(''))}
      onError={onError ?? (() => onSuccess(''))}
      options={{ theme: 'dark', refreshExpired: 'auto' }}
    />
  );
}
