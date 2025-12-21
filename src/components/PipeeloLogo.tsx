interface PipeeloLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
};

export const PipeeloLogo = ({ className = "", size = "md" }: PipeeloLogoProps) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Pipeelo Icon */}
      <svg
        className={sizeClasses[size]}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="20" cy="20" r="18" className="fill-primary" />
        <circle cx="20" cy="20" r="8" className="fill-background" />
        <circle cx="20" cy="20" r="4" className="fill-primary" />
      </svg>
      
      {/* Pipeelo Text */}
      <span className={`font-bold tracking-tight text-foreground ${
        size === "sm" ? "text-lg" : size === "md" ? "text-xl" : "text-2xl"
      }`}>
        PIPEELO
      </span>
    </div>
  );
};