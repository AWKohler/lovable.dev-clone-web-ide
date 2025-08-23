import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500": variant === "default",
            "border border-gray-300 bg-transparent hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800": variant === "outline",
            "hover:bg-gray-100 dark:hover:bg-gray-800": variant === "ghost",
          },
          {
            "h-10 px-4 py-2 text-sm": size === "default",
            "h-8 px-3 py-1.5 text-xs": size === "sm",
            "h-12 px-6 py-3 text-base": size === "lg",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };