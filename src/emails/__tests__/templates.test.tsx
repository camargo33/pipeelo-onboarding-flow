import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import * as React from 'react';
import WelcomeCEO from '../WelcomeCEO';
import ReminderStalled from '../ReminderStalled';
import CredentialsReady from '../CredentialsReady';
import JarvisFailedAlert from '../JarvisFailedAlert';

/**
 * Snapshot + smoke tests dos 4 templates React Email (Plan 05-01).
 *
 * Cobertura por template:
 *  1. HTML válido (começa com <!DOCTYPE ou <html)
 *  2. Accent IDV 2026 #01d5ac presente
 *  3. Background IDV 2026 #000D0A presente
 *  4. Sem "senha" / "password" (regression Pitfall 7 — magic link only)
 *  5. magicLink/CTA URL presente
 *  6. Snapshot fixado (regression visual)
 *
 * Extra: XSS escape no JarvisFailedAlert (lastError com <script>).
 */

const MAGIC_LINK_BASE =
  'https://onboarding.pipeelo.com/?session=test-session-id&token=fake-token-abc123';

/**
 * React Email escapa `&` para `&amp;` no HTML renderizado (correto, é HTML válido).
 * Comparação faz transform pra ambos os lados antes de checar substring.
 */
const expectIdvCompliant = (html: string, magicLink: string) => {
  expect(html).toMatch(/^<!DOCTYPE html|^<html/i);
  expect(html).toContain('#01d5ac');
  expect(html).toContain('#000D0A');
  expect(html).not.toMatch(/senha[:\s]|password[:\s]/i);
  const escapedLink = magicLink.replace(/&/g, '&amp;');
  expect(html).toContain(escapedLink);
};

describe('WelcomeCEO', () => {
  const props = {
    ceoNome: 'Felipe Camargo',
    empresaNome: 'Pipeelo Tecnologia',
    magicLink: MAGIC_LINK_BASE,
  };

  it('renders valid IDV-compliant HTML with magic link', async () => {
    const html = await render(<WelcomeCEO {...props} />);
    expectIdvCompliant(html, props.magicLink);
    expect(html).toContain('Felipe Camargo');
    expect(html).toContain('Pipeelo Tecnologia');
    expect(html).toContain('45 minutos');
  });

  it('matches snapshot', async () => {
    const html = await render(<WelcomeCEO {...props} />);
    expect(html).toMatchSnapshot();
  });
});

describe('ReminderStalled', () => {
  const props = {
    ceoNome: 'Felipe Camargo',
    empresaNome: 'Pipeelo Tecnologia',
    departamentoAtual: 'Suporte',
    magicLink: MAGIC_LINK_BASE,
    horasParado: 49,
  };

  it('renders valid IDV-compliant HTML with stalled context', async () => {
    const html = await render(<ReminderStalled {...props} />);
    expectIdvCompliant(html, props.magicLink);
    expect(html).toContain('Suporte');
    expect(html).toContain('>49<');
  });

  it('matches snapshot', async () => {
    const html = await render(<ReminderStalled {...props} />);
    expect(html).toMatchSnapshot();
  });
});

describe('CredentialsReady', () => {
  const props = {
    ceoNome: 'Felipe Camargo',
    empresaNome: 'Pipeelo Tecnologia',
    tenantSlug: 'pipeelo-tec',
    magicLink: MAGIC_LINK_BASE,
    expiresAt: '2026-05-11T21:30:00Z',
  };

  it('renders valid IDV-compliant HTML with formatted BRT expiry', async () => {
    const html = await render(<CredentialsReady {...props} />);
    expectIdvCompliant(html, props.magicLink);
    // 2026-05-11T21:30:00Z → 11/05/2026 18:30 BRT (Sao_Paulo UTC-3)
    expect(html).toContain('11/05/2026');
    expect(html).toContain('Pipeelo Tecnologia');
    expect(html).toContain('72');
  });

  it('matches snapshot', async () => {
    const html = await render(<CredentialsReady {...props} />);
    expect(html).toMatchSnapshot();
  });
});

describe('JarvisFailedAlert', () => {
  const props = {
    sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    empresaNome: 'Pipeelo Tecnologia',
    attemptCount: 3,
    lastError: 'Connection refused: ECONNREFUSED 127.0.0.1:5432',
    painelUrl: 'https://admin.pipeelo.com/jarvis/runs/abc123',
    traceUrl: 'https://cloud.langfuse.com/trace/xyz',
  };

  it('renders valid IDV-compliant HTML with painel URL', async () => {
    const html = await render(<JarvisFailedAlert {...props} />);
    expectIdvCompliant(html, props.painelUrl);
    expect(html).toContain('aaaaaaaa');
    // React insere comentários `<!-- -->` entre nós de texto adjacentes; checamos os tokens separados
    expect(html).toContain('>3<');
    expect(html).toContain('tentativas');
    expect(html).toContain('ECONNREFUSED');
  });

  it('escapes XSS in lastError', async () => {
    const xssProps = {
      ...props,
      lastError: '<script>alert(1)</script>',
    };
    const html = await render(<JarvisFailedAlert {...xssProps} />);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toMatch(/&lt;script&gt;|&#x3C;script/);
  });

  it('matches snapshot', async () => {
    const html = await render(<JarvisFailedAlert {...props} />);
    expect(html).toMatchSnapshot();
  });
});
