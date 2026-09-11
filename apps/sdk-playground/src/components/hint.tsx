import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
export function Hint({
  content,
  children,
  side = "top",
}: {
  content?: string | undefined;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactElement;
}) {
  if (!content) return children;
  const props = children.props as { disabled?: boolean; className?: string };
  const target = props.disabled ? (
    <span
      tabIndex={0}
      aria-disabled="true"
      className="editor-disabled-hint"
      style={{
        display: props.className?.includes("inspector-range")
          ? "block"
          : "inline-flex",
        maxWidth: "100%",
      }}
    >
      {children}
    </span>
  ) : (
    children
  );
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{target}</TooltipTrigger>
        <TooltipContent className="editor-tooltip" side={side} sideOffset={6}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
