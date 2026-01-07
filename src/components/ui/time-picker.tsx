import * as React from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TimePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function TimePicker({ value, onChange, className, disabled }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  
  // Parse current value
  const [hours, minutes] = React.useMemo(() => {
    if (!value) return ['--', '--'];
    const parts = value.split(':');
    return [parts[0] || '--', parts[1] || '--'];
  }, [value]);

  const handleSelect = (type: 'hours' | 'minutes', val: string) => {
    const newHours = type === 'hours' ? val : hours === '--' ? '08' : hours;
    const newMinutes = type === 'minutes' ? val : minutes === '--' ? '00' : minutes;
    onChange?.(`${newHours}:${newMinutes}`);
  };

  const hourOptions = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minuteOptions = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

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
          {value || "--:--"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Hours */}
          <div className="border-r">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground text-center border-b">
              Hora
            </div>
            <ScrollArea className="h-48">
              <div className="p-1">
                {hourOptions.map((hour) => (
                  <Button
                    key={hour}
                    variant={hours === hour ? "default" : "ghost"}
                    className={cn(
                      "w-full justify-center px-3 py-1 h-8",
                      hours === hour && "bg-pipeelo-blue hover:bg-pipeelo-blue/90"
                    )}
                    onClick={() => handleSelect('hours', hour)}
                  >
                    {hour}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
          
          {/* Minutes */}
          <div>
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground text-center border-b">
              Min
            </div>
            <ScrollArea className="h-48">
              <div className="p-1">
                {minuteOptions.map((minute) => (
                  <Button
                    key={minute}
                    variant={minutes === minute ? "default" : "ghost"}
                    className={cn(
                      "w-full justify-center px-3 py-1 h-8",
                      minutes === minute && "bg-pipeelo-blue hover:bg-pipeelo-blue/90"
                    )}
                    onClick={() => handleSelect('minutes', minute)}
                  >
                    {minute}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
