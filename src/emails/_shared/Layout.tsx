import {
  Html,
  Head,
  Body,
  Container,
  Preview,
  Tailwind,
  Section,
  Text,
  Hr,
} from '@react-email/components';
import * as React from 'react';
import { EMAIL_COLORS, EMAIL_TAILWIND_CONFIG } from './tokens';

interface LayoutProps {
  preview: string;
  children: React.ReactNode;
  /**
   * Quando true, header ganha borda urgent (#ef4444) — usado em alertas internos
   * (JarvisFailedAlert). Default false.
   */
  urgent?: boolean;
}

/**
 * Layout shared dos templates Pipeelo (IDV 2026).
 *
 * - Background forest #000D0A
 * - Container max-w 600px (padrão de email client compatível)
 * - Wordmark "pipeelo" como header simples (Inter weight 700, mint)
 * - Footer com endereço fictício/legal pra deliverability
 *
 * Ref: brandbook IDV 2026 (HARD-10) + React Email v6.
 */
export function Layout({ preview, children, urgent = false }: LayoutProps) {
  const headerBorderColor = urgent ? EMAIL_COLORS.urgent : EMAIL_COLORS.mint;

  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind config={EMAIL_TAILWIND_CONFIG}>
        <Body
          style={{
            backgroundColor: EMAIL_COLORS.forest,
            margin: 0,
            padding: '24px 0',
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <Container
            style={{
              maxWidth: '600px',
              margin: '0 auto',
              backgroundColor: EMAIL_COLORS.forest,
              padding: '0',
            }}
          >
            <Section
              style={{
                padding: '24px 32px',
                borderBottom: `2px solid ${headerBorderColor}`,
              }}
            >
              <Text
                style={{
                  margin: 0,
                  color: EMAIL_COLORS.mint,
                  fontWeight: 700,
                  fontSize: '24px',
                  letterSpacing: '-0.5px',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                pipeelo
              </Text>
            </Section>

            <Section style={{ padding: '32px' }}>{children}</Section>

            <Hr style={{ borderColor: EMAIL_COLORS.surface, margin: '0 32px' }} />

            <Section style={{ padding: '24px 32px' }}>
              <Text
                style={{
                  margin: 0,
                  color: EMAIL_COLORS.muted,
                  fontSize: '12px',
                  lineHeight: '18px',
                }}
              >
                Pipeelo Tecnologia — Plataforma de automação de atendimento para
                ISPs.
                <br />
                Você recebeu este email porque iniciou um processo de onboarding.
                Em caso de dúvida, responda este email.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default Layout;
