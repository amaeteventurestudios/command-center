// shadcn/ui Input (MIT, https://ui.shadcn.com), adapted to this app's tokens.
import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full min-w-0 rounded-md border bg-muted px-3 text-sm placeholder:text-muted-foreground outline-none",
        className
      )}
      {...props}
    />
  );
}
