import type { Metadata } from "next";
import { Bricolage_Grotesque, Literata } from "next/font/google";
import { SmoothScroll } from "@/components/SmoothScroll";
import "./globals.css";

const literata = Literata({ variable: "--font-literata", subsets: ["latin"], style: ["normal", "italic"] });
// Display, interface and chart labels. Its width axis gives the hero its condensed setting.
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], axes: ["opsz", "wdth"] });

export const metadata: Metadata = {
  title: "Concept Explainer",
  description: "Ask about an AI concept you don't understand and get an interactive lesson.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${literata.variable} ${bricolage.variable} antialiased`}>
      <body className="min-h-dvh">
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
