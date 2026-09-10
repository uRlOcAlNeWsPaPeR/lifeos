import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmHost } from "@/components/ui/confirm";
import { BackgroundFX } from "@/components/background-fx";
import { AuthProvider } from "@/lib/firebase/auth-context";

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
    <html lang="en" className={`dark ${inter.variable}`}>
      <body>
        <AuthProvider>
          <BackgroundFX />
          {children}
          <Toaster />
          <ConfirmHost />
        </AuthProvider>
      </body>
    </html>
  );
}
