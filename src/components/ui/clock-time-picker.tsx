import * as React from "react";
import { Clock, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ClockTimePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function ClockTimePicker({ value, onChange, className, disabled }: ClockTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  
  // Parse current value
  const [hours, minutes] = React.useMemo(() => {
    if (!value) return [8, 0];
    const parts = value.split(':');
    return [parseInt(parts[0]) || 8, parseInt(parts[1]) || 0];
  }, [value]);

  const updateTime = (newHours: number, newMinutes: number) => {
    // Wrap around
    if (newHours < 0) newHours = 23;
    if (newHours > 23) newHours = 0;
    if (newMinutes < 0) newMinutes = 55;
    if (newMinutes > 55) newMinutes = 0;
    
    const formattedHours = newHours.toString().padStart(2, '0');
    const formattedMinutes = newMinutes.toString().padStart(2, '0');
    onChange?.(`${formattedHours}:${formattedMinutes}`);
  };

  const incrementHours = () => updateTime(hours + 1, minutes);
  const decrementHours = () => updateTime(hours - 1, minutes);
  const incrementMinutes = () => updateTime(hours, minutes + 5);
  const decrementMinutes = () => updateTime(hours, minutes - 5);

  const displayValue = value || "--:--";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-36 justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <Clock className="mr-2 h-4 w-4" />
          {displayValue}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4 bg-background border shadow-lg" align="start">
        <div className="flex items-center gap-2">
          {/* Hours Column */}
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full hover:bg-pipeelo-blue/10"
              onClick={incrementHours}
            >
              <ChevronUp className="h-5 w-5" />
            </Button>
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-pipeelo-blue/10 border-2 border-pipeelo-blue flex items-center justify-center">
                <span className="text-2xl font-bold text-pipeelo-blue">
                  {hours.toString().padStart(2, '0')}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full hover:bg-pipeelo-blue/10"
              onClick={decrementHours}
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
            <span className="text-xs text-muted-foreground mt-1">Hora</span>
          </div>

          {/* Separator */}
          <div className="text-3xl font-bold text-muted-foreground pb-6">:</div>

          {/* Minutes Column */}
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full hover:bg-pipeelo-green/10"
              onClick={incrementMinutes}
            >
              <ChevronUp className="h-5 w-5" />
            </Button>
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-pipeelo-green/10 border-2 border-pipeelo-green flex items-center justify-center">
                <span className="text-2xl font-bold text-pipeelo-green">
                  {minutes.toString().padStart(2, '0')}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full hover:bg-pipeelo-green/10"
              onClick={decrementMinutes}
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
            <span className="text-xs text-muted-foreground mt-1">Min</span>
          </div>
        </div>

        {/* Quick select buttons */}
        <div className="flex gap-2 mt-4 justify-center">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => {
              onChange?.("08:00");
            }}
          >
            08:00
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => {
              onChange?.("12:00");
            }}
          >
            12:00
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => {
              onChange?.("18:00");
            }}
          >
            18:00
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
