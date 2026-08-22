/**
 * The two faces, self-hosted by next/font.
 *
 * Inter was named in the token file for months and never actually loaded, so
 * every screen was rendering in whatever the system had. The type sizes here
 * are tuned to Inter's metrics — 11px metadata, 12.5px rows, 26px stat numbers —
 * so loading it is a correction rather than a change of direction.
 *
 * JetBrains Mono carries the metadata: eyebrows, tool names, connection URLs,
 * counts and dates. That is where the distinctiveness lives, which is why there
 * is no display face — a third font would have to earn its download on the
 * marketing page alone and it doesn't.
 */
import { Inter, JetBrains_Mono } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});
