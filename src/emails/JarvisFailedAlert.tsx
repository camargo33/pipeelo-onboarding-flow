import { Button, Text, Heading, Link } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_shared/Layout';
import { EMAIL_COLORS } from './_shared/tokens';

export interface JarvisFailedAlertProps {
  sessionId: string;
  empresaNome: string;
  attemptCount: number;
  lastError: string;
  painelUrl: string;
  traceUrl?: string;
}

/**
 * JarvisFailedAlert — Alerta interno operacional (Felipe + ops).
 *
 * Tom: incident report técnico. Sem hype, sem emojis. Borda urgent (#ef4444) no
 * Layout pra dar pinta visual de incidente. lastError em <code> escapado pelo
 * React (sem dangerouslySetInnerHTML — Pitfall XSS).
 */
export function JarvisFailedAlert({
  sessionId,
  empresaNome,
  attemptCount,
  lastError,
  painelUrl,
  traceUrl,
}: JarvisFailedAlertProps) {
  const sessionShort = sessionId.slice(0, 8);

  return (
    <Layout
      urgent
      preview={`Jarvis falhou definitivo — sessão ${sessionShort} (${empresaNome})`}
    >
      <Heading
        as="h1"
        style={{
          color: EMAIL_COLORS.urgent,
          fontSize: '20px',
          lineHeight: '28px',
          margin: '0 0 8px',
          fontWeight: 700,
        }}
      >
        Jarvis falhou definitivo
      </Heading>

      <Text
        style={{
          color: EMAIL_COLORS.muted,
          fontSize: '13px',
          margin: '0 0 24px',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        }}
      >
        session_id: {sessionId}
      </Text>

      <Text
        style={{
          color: EMAIL_COLORS.ink,
          fontSize: '15px',
          lineHeight: '22px',
          margin: '0 0 8px',
        }}
      >
        Tenant: <strong style={{ color: EMAIL_COLORS.mint }}>{empresaNome}</strong>
      </Text>

      <Text
        style={{
          color: EMAIL_COLORS.ink,
          fontSize: '15px',
          lineHeight: '22px',
          margin: '0 0 24px',
        }}
      >
        Jarvis abortou após <strong>{attemptCount} tentativas</strong>. Status final:
        FAILED. Sessão NÃO foi promovida para tenant live.
      </Text>

      <Text
        style={{
          color: EMAIL_COLORS.ink,
          fontSize: '14px',
          lineHeight: '20px',
          margin: '0 0 8px',
          fontWeight: 700,
        }}
      >
        Último erro:
      </Text>

      <Text
        style={{
          margin: '0 0 24px',
        }}
      >
        <code
          style={{
            display: 'block',
            color: EMAIL_COLORS.ink,
            backgroundColor: EMAIL_COLORS.surface,
            border: `1px solid ${EMAIL_COLORS.urgent}`,
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            lineHeight: '18px',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {lastError}
        </code>
      </Text>

      <Button
        href={painelUrl}
        style={{
          backgroundColor: EMAIL_COLORS.mint,
          color: EMAIL_COLORS.forest,
          fontWeight: 700,
          padding: '12px 24px',
          borderRadius: '8px',
          fontSize: '15px',
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Abrir no painel
      </Button>

      {traceUrl ? (
        <Text
          style={{
            color: EMAIL_COLORS.muted,
            fontSize: '13px',
            lineHeight: '20px',
            margin: '24px 0 0',
          }}
        >
          <Link
            href={traceUrl}
            style={{ color: EMAIL_COLORS.mint, textDecoration: 'underline' }}
          >
            Ver trace no Langfuse
          </Link>
        </Text>
      ) : null}

      <Text
        style={{
          color: EMAIL_COLORS.muted,
          fontSize: '12px',
          lineHeight: '18px',
          margin: '32px 0 0',
        }}
      >
        Alerta automático — gerado pelo cron Jarvis após exceder MAX_ITER ou erro fatal.
      </Text>
    </Layout>
  );
}

export default JarvisFailedAlert;
