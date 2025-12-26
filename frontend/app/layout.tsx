import type { Metadata } from "next";
import { Outfit, Fira_Code } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const firaCode = Fira_Code({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Gift Maker - Create & Share 3D Gifts",
  description: "Create magical 3D gifts with AI and share them with the world. Generate objects, arrange them, wrap as gifts, and let others discover your creations.",
  keywords: ["3D", "gifts", "AI", "text-to-3D", "three.js", "creative"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${outfit.variable} ${firaCode.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
