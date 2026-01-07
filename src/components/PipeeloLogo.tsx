import pipeeloLogo from "@/assets/pipeelo-logo.png";
import pipeeloIcon from "@/assets/pipeelo-icon.png";

interface PipeeloLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
}

const sizeClasses = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
};

export const PipeeloLogo = ({ className = "", size = "md", iconOnly = false }: PipeeloLogoProps) => {
  if (iconOnly) {
    return (
      <img 
        src={pipeeloIcon} 
        alt="Pipeelo" 
        className={`${sizeClasses[size]} ${className}`}
      />
    );
  }

  return (
    <img 
      src={pipeeloLogo} 
      alt="Pipeelo" 
      className={`${sizeClasses[size]} ${className}`}
    />
  );
};
