"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { LaptopIcon, MoonIcon, PaletteIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const THEMES = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: LaptopIcon },
];

export function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the stored choice after mount; until then, don't
  // claim any option is selected.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-xl">
            <PaletteIcon className="size-[18px]" />
          </div>
          <div>
            <CardTitle className="text-[15px]">Appearance</CardTitle>
            <p className="text-muted-foreground text-sm">
              How the app looks on this device. System follows your operating system.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid max-w-md gap-2 sm:grid-cols-3">
          {THEMES.map((option) => {
            const active = mounted && theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "border-primary text-foreground bg-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                <option.icon className="size-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
