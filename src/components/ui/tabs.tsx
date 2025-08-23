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
  return (
    <div className={cn("flex bg-slate-800 rounded-lg p-1", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-all duration-200",
            selected === option.value
              ? "bg-slate-700 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-slate-700/50"
          )}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}