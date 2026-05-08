import { Button, Text, Heading } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_shared/Layout';
import { EMAIL_COLORS } from './_shared/tokens';

export interface CredentialsReadyProps {
  ceoNome: string;
  empresaNome: string;
  tenantSlug: string;
  magicLink: string;
  /** ISO 8601 string (ex: '2026-05-11T21:30:00Z') */
  expiresAt: string;
}

/**
 * Formata uma data ISO em pt-BR no fuso America/Sao_Paulo (BRT/UTC-3).
 *
 * Exemplo: '2026-05-11T21:30:00Z' → '11/05/2026 18:30'
 */
function formatBrt(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return fmt.format(date).replace(',', '');
  } catch {
    return isoDate;
  }
}

/**
 * CredentialsReady — Jarvis terminou, plataforma pronta.
 *
 * IMPORTANTE: NUNCA mostra senha plain (Pitfall 7+9). CTA é magic link com TTL 72h.
 * Usuário clica → autenticação Supabase via OTP → seta senha própria no primeiro acesso.
 */
export function CredentialsReady({
  ceoNome,
  empresaNome,
  tenantSlug,
  magicLink,
  expiresAt,
}: CredentialsReadyProps) {
  const expiresFormatted = formatBrt(expiresAt);

  return (
    <Layout
      preview={`Sua plataforma Pipeelo está pronta — acesse com o link abaixo (válido por 72h)`}
    >
      <Heading
        as="h1"
        style={{
          color: EMAIL_COLORS.ink,
          fontSize: '24px',
          lineHeight: '32px',
          margin: '0 0 16px',
          fontWeight: 700,
        }}
      >
        Sua plataforma Pipeelo está pronta.
      </Heading>

      <Text
        style={{
          color: EMAIL_COLORS.ink,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 16px',
        }}
      >
        Olá, {ceoNome}. Configuramos o agente da{' '}
        <strong style={{ color: EMAIL_COLORS.mint }}>{empresaNome}</strong> com
        base nas respostas do seu onboarding. Tenant ativo:{' '}
        <code
          style={{
            color: EMAIL_COLORS.mint,
            backgroundColor: EMAIL_COLORS.surface,
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          {tenantSlug}
        </code>
        .
      </Text>

      <Text
        style={{
          color: EMAIL_COLORS.ink,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 24px',
        }}
      >
        Use o botão abaixo para acessar a plataforma e definir sua autenticação.
      </Text>

      <Button
        href={magicLink}
        style={{
          backgroundColor: EMAIL_COLORS.mint,
          color: EMAIL_COLORS.forest,
          fontWeight: 700,
          padding: '14px 28px',
          borderRadius: '8px',
          fontSize: '16px',
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Acessar minha conta
      </Button>

      <Text
        style={{
          color: EMAIL_COLORS.muted,
          fontSize: '13px',
          lineHeight: '20px',
          margin: '32px 0 0',
        }}
      >
        Este link expira em <strong style={{ color: EMAIL_COLORS.ink }}>72 horas</strong>{' '}
        ({expiresFormatted} BRT). Se expirar, peça um novo via suporte
        respondendo este email.
      </Text>

      <Text
        style={{
          color: EMAIL_COLORS.muted,
          fontSize: '13px',
          lineHeight: '20px',
          margin: '16px 0 0',
        }}
      >
        Link direto:
        <br />
        <span style={{ color: EMAIL_COLORS.mint, wordBreak: 'break-all' }}>
          {magicLink}
        </span>
      </Text>

      <Text
        style={{
          color: EMAIL_COLORS.ink,
          fontSize: '14px',
          lineHeight: '20px',
          margin: '32px 0 0',
        }}
      >
        Equipe Pipeelo
      </Text>
    </Layout>
  );
}

export default CredentialsReady;
