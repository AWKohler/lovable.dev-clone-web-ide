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
  stretch?: boolean;
}

export function Tabs<T extends string>({ options, selected, onSelect, className, stretch }: TabsProps<T>) {
  const single = options.length === 1;
  const expand = single || stretch;
  return (
    <div className={cn("flex rounded-lg p-1 border border-border", expand && "w-full", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            "px-4 py-1 text-sm font-medium rounded-md transition-all duration-200",
            expand && "flex-1",
            selected === option.value
              ? "bg-accent text-white shadow-sm font-bold"
              : "text-muted hover:text-fg hover:bg-elevated/60"
          )}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}
