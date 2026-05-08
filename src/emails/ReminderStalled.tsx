import { Button, Text, Heading } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_shared/Layout';
import { EMAIL_COLORS } from './_shared/tokens';

export interface ReminderStalledProps {
  ceoNome: string;
  empresaNome: string;
  departamentoAtual: string;
  magicLink: string;
  horasParado: number;
}

/**
 * ReminderStalled — Sessão parada >48h.
 *
 * Voz: lembrete leve, sem culpar. Reforça o tempo curto restante e o departamento exato
 * em que parou (contexto reduz fricção pra retomar).
 */
export function ReminderStalled({
  ceoNome,
  empresaNome,
  departamentoAtual,
  magicLink,
  horasParado,
}: ReminderStalledProps) {
  return (
    <Layout
      preview={`${empresaNome} — falta pouco para concluir. Continue de onde parou em ${departamentoAtual}.`}
    >
      <Heading
        as="h1"
        style={{
          color: EMAIL_COLORS.ink,
          fontSize: '22px',
          lineHeight: '30px',
          margin: '0 0 16px',
          fontWeight: 700,
        }}
      >
        Você parou em {departamentoAtual}.
      </Heading>

      <Text
        style={{
          color: EMAIL_COLORS.ink,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 16px',
        }}
      >
        Olá, {ceoNome}. Faz {horasParado}h que o onboarding da{' '}
        <strong style={{ color: EMAIL_COLORS.mint }}>{empresaNome}</strong> está
        em pausa. Suas respostas estão salvas — basta retomar de onde você parou.
      </Text>

      <Text
        style={{
          color: EMAIL_COLORS.ink,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 24px',
        }}
      >
        Quanto antes você terminar, antes seu agente entra em produção.
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
        Continuar de onde parei
      </Button>

      <Text
        style={{
          color: EMAIL_COLORS.muted,
          fontSize: '13px',
          lineHeight: '20px',
          margin: '32px 0 0',
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

export default ReminderStalled;
