"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes resolves the stored theme during the first client render, which
  // would not match what the server rendered. Hold "system" until after mount.
  useEffect(() => setMounted(true), []);

  return (
    <Sonner
      theme={mounted ? ((resolvedTheme as ToasterProps["theme"]) ?? "system") : "system"}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border !elev-3 !backdrop-blur-md",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
