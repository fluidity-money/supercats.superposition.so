import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://supercats.superposition.so"),
  title: "Supercats Claims",
  description: "Claim your Superposition Supercats onchain.",
  openGraph: {
    title: "Supercats NFTs",
    description: "Claim your Superposition Supercats onchain.",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Supercats NFTs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Supercats NFTs",
    description: "Claim your Superposition Supercats onchain.",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
