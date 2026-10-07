import type { Metadata } from "next";
import { Instrument_Sans, Literata } from "next/font/google";
import "./globals.css";

const literata = Literata({ variable: "--font-literata", subsets: ["latin"], style: ["normal", "italic"] });
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Concept Explainer",
  description: "Ask about an AI concept you don't understand and get an interactive lesson.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${literata.variable} ${instrument.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
