import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });
const text = Barlow({ variable: "--font-text", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Rome Pay", template: "%s · Rome Pay" },
  description: "USDC payment links on Rome. Pay from MetaMask or Solflare; the merchant gets the same receipt either way.",
};

export const viewport: Viewport = { themeColor: "#0f1d3a", colorScheme: "dark" };

// Direction contract (impeccable). Kept as a real HTML comment in the emitted markup.
const CONTRACT = `<!--
THESIS: A payment is a ride on a transit map. Your wallet's line runs through its setup stations into the PayRouter interchange and arrives at the merchant terminus. Refuses the white card with a soft Pay button.
OWN-WORLD: Midnight enamel #0f1d3a wall, porcelain #f5f6f2 destination plate, cobalt MetaMask line, green Solflare line, amber pending, scarlet failed. Condensed transit caps, flat signage, round station marks, 45/90 bends, mono readout. No glow.
STORY: The payer sees who gets how much, picks a line, sees every signature before making it, clears one station per click, and leaves with a Via receipt.
FIRST VIEWPORT: Porcelain destination plate (merchant h1, huge amount, memo, ref) on top; two line badges under it; the route map; one full-width next-station button under the route. Signature interaction: each click clears one station. Motion: on arrival the line fills into the terminus.
FORM: Interchange, position 1 (assigned), seed e4f69ee6.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body>
        <div hidden dangerouslySetInnerHTML={{ __html: CONTRACT }} />
        {children}
      </body>
    </html>
  );
}
