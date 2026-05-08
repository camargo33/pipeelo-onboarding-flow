import { LIME_ACCENT } from "@/styles/theme";

/**
 * PipeeloLogo — IDV 2026 (HARD-10)
 *
 * Logo SVG inline (substitui o PNG legado de 19/Apr). Sem dependencia de asset
 * versionado, fill controlado via prop, escalavel sem perda.
 *
 * NOTE: este SVG e um placeholder tipografico fiel ao brandbook 2026 enquanto
 * Felipe nao entrega os paths oficiais do logo. API estavel: substituir
 * apenas o conteudo do <svg> mantendo as props e o aria-label.
 *
 * Props (compat com versao PNG anterior):
 * - className: utilitarias Tailwind (sizing, margin, etc)
 * - size: "sm" | "md" | "lg" (mapeia para h-6/8/10) — mantido para compat
 * - iconOnly: renderiza apenas o glyph "P" sem o wordmark
 * - fill: cor principal (default LIME_ACCENT #01d5ac)
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
  fill = LIME_ACCENT,
}: PipeeloLogoProps) => {
  const cls = `${sizeClasses[size]} ${className}`.trim();

  if (iconOnly) {
    return (
      <svg
        className={cls}
        viewBox="0 0 60 60"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Pipeelo"
        role="img"
      >
        <text
          x="6"
          y="46"
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight={700}
          fontSize="48"
          fill={fill}
        >
          p
        </text>
      </svg>
    );
  }

  return (
    <svg
      className={cls}
      viewBox="0 0 200 60"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Pipeelo"
      role="img"
    >
      <text
        x="0"
        y="44"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={700}
        fontSize="44"
        letterSpacing="-1"
        fill={fill}
      >
        pipeelo
      </text>
    </svg>
  );
};

export default PipeeloLogo;
