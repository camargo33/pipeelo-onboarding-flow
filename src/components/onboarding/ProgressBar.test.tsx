import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';
import { DEPARTMENT_ORDER } from '@/types/onboarding';

/**
 * ProgressBar é genérico (current/total/percentage). HARD-06 fix vive
 * em OnboardingSession.tsx (denominador = DEPARTMENT_ORDER.length = 5).
 * Este teste garante que ProgressBar renderiza corretamente com qualquer
 * total — incluindo o caso /5 (5 departamentos) usado pela tela.
 */
describe('<ProgressBar />', () => {
  it('renderiza X/Y perguntas', () => {
    const { getByText } = render(
      <ProgressBar current={3} total={10} percentage={30} />,
    );
    expect(getByText('3/10 perguntas')).toBeInTheDocument();
  });

  it('renderiza 0/N quando ninguém preencheu', () => {
    const { getByText } = render(
      <ProgressBar current={0} total={5} percentage={0} />,
    );
    expect(getByText('0/5 perguntas')).toBeInTheDocument();
  });

  it('aceita total = DEPARTMENT_ORDER.length (= 5) — HARD-06 baseline', () => {
    expect(DEPARTMENT_ORDER.length).toBe(5);
    const { getByText } = render(
      <ProgressBar current={5} total={DEPARTMENT_ORDER.length} percentage={100} />,
    );
    expect(getByText('5/5 perguntas')).toBeInTheDocument();
  });

  it('renderiza sectionName quando fornecido', () => {
    const { getByText } = render(
      <ProgressBar
        current={1}
        total={3}
        percentage={33}
        sectionName="Identificação"
      />,
    );
    expect(getByText('Identificação')).toBeInTheDocument();
  });
});
