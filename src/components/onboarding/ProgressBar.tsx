import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  current: number;
  total: number;
  percentage: number;
  sectionName?: string;
}

export function ProgressBar({ current, total, percentage, sectionName }: ProgressBarProps) {
  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">
          {sectionName && <span className="font-medium text-foreground">{sectionName}</span>}
        </span>
        <span className="text-muted-foreground font-medium">
          {current}/{total} perguntas
        </span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}
