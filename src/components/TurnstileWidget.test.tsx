import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: (props: { siteKey: string }) => (
    <div data-testid="turnstile-mock" data-sitekey={props.siteKey} />
  ),
}));

import { TurnstileWidget } from './TurnstileWidget';

describe('<TurnstileWidget />', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retorna null se VITE_TURNSTILE_SITE_KEY ausente', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    const { container } = render(<TurnstileWidget onSuccess={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza Turnstile com siteKey quando env presente', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-123');
    const { getByTestId } = render(<TurnstileWidget onSuccess={() => {}} />);
    expect(getByTestId('turnstile-mock').getAttribute('data-sitekey')).toBe('site-key-123');
  });
});
