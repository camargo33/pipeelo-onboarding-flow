import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PipeeloLogo } from './PipeeloLogo';

describe('<PipeeloLogo />', () => {
  it('renderiza o asset oficial como img', () => {
    const { container } = render(<PipeeloLogo />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/pipeelo-logo.png');
    expect(img?.getAttribute('alt')).toBe('Pipeelo');
  });

  it('iconOnly usa o glyph circular', () => {
    const { container } = render(<PipeeloLogo iconOnly />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/pipeelo-icon.png');
  });

  it('aceita className e size props', () => {
    const { container } = render(<PipeeloLogo size="lg" className="opacity-90" />);
    const cls = container.querySelector('img')?.getAttribute('class') ?? '';
    expect(cls).toContain('h-10');
    expect(cls).toContain('opacity-90');
  });

  it('snapshot estavel', () => {
    const { container } = render(<PipeeloLogo />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
