import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmHost } from "@/components/ui/confirm";
import { BackgroundFX } from "@/components/background-fx";
import { AmbientScene } from "@/components/three/ambient-scene-loader";
import { AuthProvider } from "@/lib/firebase/auth-context";
import { INTRO_SCRIPT } from "@/components/marketing/intro-reveal";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "LifeOS — Your entire student life. Organized.",
  description:
    "LifeOS turns your assignments, deadlines, goals, and plans into one intelligent system.",
};

export const viewport: Viewport = {
  themeColor: "#0a0f0d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: INTRO_SCRIPT sets data-intro on <html> before React hydrates.
    <html lang="en" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Landing intro: decide play/skip before first paint (see intro-reveal.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          <BackgroundFX />
          <AmbientScene />
          {children}
          <Toaster />
          <ConfirmHost />
        </AuthProvider>
      </body>
    </html>
  );
}
