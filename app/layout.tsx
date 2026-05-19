import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-app-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LimeChat AI Evaluations Platform",
  description: "Customer Success Overview powered by LimeChat",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
