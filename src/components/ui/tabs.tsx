import { cn } from "@/lib/utils";

export type TabOption<T extends string> = {
  value: T;
  text: string;
};

interface TabsProps<T extends string> {
  options: TabOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ options, selected, onSelect, className }: TabsProps<T>) {
  const single = options.length === 1;
  return (
    <div className={cn("flex bg-soft rounded-lg p-1 border border-border", single && "w-full", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-all duration-200",
            single && "flex-1",
            selected === option.value
              ? "bg-elevated text-fg shadow-sm"
              : "text-muted hover:text-fg hover:bg-elevated/60"
          )}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}
