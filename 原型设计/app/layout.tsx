import type { Metadata, Viewport } from "next"
import { Inter, Oswald, JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/sonner"
import { AppProvider } from "@/components/app-provider"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
})

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
})

export const metadata: Metadata = {
  title: "铁拳搏击 · IRONFIST MUAY THAI",
  description: "泰拳搏击馆会员小程序 · 预约 · 核销 · 课时管理",
  generator: "v0.app",
}

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} ${oswald.variable} ${jetbrains.variable} bg-background`}
    >
      <body className="font-sans antialiased bg-background text-foreground">
        <AppProvider>{children}</AppProvider>
        <Toaster position="top-center" theme="dark" />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
