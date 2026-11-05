// shadcn/ui Badge (MIT, https://ui.shadcn.com), adapted to this app's tokens.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground",
        outline: "border text-muted-foreground",
        solid: "bg-foreground text-background",
        bad: "bg-bad text-background",
      },
    },
    defaultVariants: { variant: "outline" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
