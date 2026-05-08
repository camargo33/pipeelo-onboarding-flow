import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PipeeloLogo } from './PipeeloLogo';
import { LIME_ACCENT } from '@/styles/theme';

describe('<PipeeloLogo />', () => {
  it('renderiza SVG inline (nao img)', () => {
    const { container } = render(<PipeeloLogo />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('usa fill LIME_ACCENT por default', () => {
    const { container } = render(<PipeeloLogo />);
    const svg = container.querySelector('svg')!;
    // Pelo menos um elemento pintado deve usar o lime accent.
    const html = svg.outerHTML;
    expect(html.toLowerCase()).toContain(LIME_ACCENT.toLowerCase());
  });

  it('aceita className prop', () => {
    const { container } = render(<PipeeloLogo className="h-8 w-auto" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('h-8');
  });

  it('snapshot estavel', () => {
    const { container } = render(<PipeeloLogo />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
