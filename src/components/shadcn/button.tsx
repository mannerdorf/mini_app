import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--guest-ring))] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[hsl(var(--guest-primary))] text-[hsl(var(--guest-primary-foreground))] hover:opacity-95",
        secondary: "bg-[hsl(var(--guest-secondary))] text-[hsl(var(--guest-secondary-foreground))] hover:bg-[hsl(var(--guest-muted))]",
        outline: "border border-[hsl(var(--guest-border))] bg-[hsl(var(--guest-card))] hover:bg-[hsl(var(--guest-muted))]",
        ghost: "hover:bg-[hsl(var(--guest-muted))] text-[hsl(var(--guest-foreground))]",
        dark: "bg-[hsl(var(--guest-foreground))] text-[hsl(var(--guest-card))] hover:opacity-90",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
