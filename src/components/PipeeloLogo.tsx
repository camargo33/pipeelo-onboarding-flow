/**
 * PipeeloLogo — logo oficial (brandbook 2026).
 *
 * Renderiza os assets oficiais de `public/` (wordmark mint + glyph do conector
 * de fibra). Substitui o placeholder tipográfico SVG da IDV 2026.
 *
 * Props (API estável desde a versão PNG legada):
 * - className: utilitárias Tailwind (sizing, margin, etc)
 * - size: "sm" | "md" | "lg" (mapeia para h-6/8/10)
 * - iconOnly: renderiza apenas o glyph circular, sem o wordmark
 * - fill: ignorado (mantido por compat — os assets já são mint #01d5ac)
 */

interface PipeeloLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  fill?: string;
}

const sizeClasses: Record<NonNullable<PipeeloLogoProps["size"]>, string> = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
};

export const PipeeloLogo = ({
  className = "",
  size = "md",
  iconOnly = false,
}: PipeeloLogoProps) => {
  const cls = `${sizeClasses[size]} w-auto select-none ${className}`.trim();

  return (
    <img
      src={iconOnly ? "/pipeelo-icon.png" : "/pipeelo-logo.png"}
      alt="Pipeelo"
      className={cls}
      draggable={false}
    />
  );
};

export default PipeeloLogo;
