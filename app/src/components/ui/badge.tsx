import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border px-2 font-mono text-[0.6875rem] whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-paper-3 text-ink-2",
        outline: "border-rule text-muted",
        success: "border-transparent bg-success/12 text-success",
        danger: "border-transparent bg-danger/12 text-danger",
        warning: "border-transparent bg-warning/12 text-warning",
        info: "border-transparent bg-info/12 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ variant }), className) },
      props,
    ),
    render,
    state: { slot: "badge", variant },
  });
}

export { Badge, badgeVariants };
