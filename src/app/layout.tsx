import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { inter, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hired",
  applicationName: "Hired",
  description:
    "Everything you've ever done, kept in one place you can talk to — and the resumes, applications and contacts that come out of it.",
  openGraph: {
    title: "Hired",
    siteName: "Hired",
    description:
      "Everything you've ever done, kept in one place you can talk to — and the resumes, applications and contacts that come out of it.",
    type: "website",
  },
};

export const viewport: Viewport = {
  // The sRGB of --background in each theme. These were eyeballed before and
  // both missed, which shows up as a seam between the browser chrome and the
  // top of the page on mobile.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0e10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
