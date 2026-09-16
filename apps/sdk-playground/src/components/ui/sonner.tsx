// Adapted from shadcn/ui new-york-v4 (MIT).
"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ position = "bottom-right", ...props }: ToasterProps) => {
  return (
    <Sonner
      position={position}
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "#e5efc9",
          "--normal-text": "#19352e",
          "--normal-border": "#b5ce88",
          "--success-bg": "#d9f5e2",
          "--success-text": "#12532e",
          "--success-border": "#79c996",
          "--info-bg": "#dcedff",
          "--info-text": "#174b78",
          "--info-border": "#8bbceb",
          "--warning-bg": "#fff0c2",
          "--warning-text": "#704400",
          "--warning-border": "#e3b552",
          "--error-bg": "#ffe0df",
          "--error-text": "#8c2529",
          "--error-border": "#e69a9d",
          "--border-radius": "8px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
