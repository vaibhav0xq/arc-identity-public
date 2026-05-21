import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { ARC_PUBLIC_APP_URL } from "@/lib/links";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap"
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap"
});

const metadataDescription = "Payments are solved, trust isn't. ARC Identity is an onchain reputation and wallet intelligence platform for Arc stablecoin users - transaction-verified trust scoring, multichain analytics, and portable identity.";
const brandIcon = "/brand/arc-identity-icon.png";
const brandIcon32 = "/brand/arc-identity-icon-32.png";
const brandIcon192 = "/brand/arc-identity-icon-192.png";
const brandIcon512 = "/brand/arc-identity-icon-512.png";
const brandWordmark = "/brand/arc-identity-wordmark.png";

export const metadata: Metadata = {
  metadataBase: new URL(ARC_PUBLIC_APP_URL),
  title: "ARC Identity",
  description: metadataDescription,
  alternates: {
    canonical: "/"
  },
  icons: {
    icon: [
      { url: brandIcon32, sizes: "32x32", type: "image/png" },
      { url: brandIcon192, sizes: "192x192", type: "image/png" },
      { url: brandIcon512, sizes: "512x512", type: "image/png" },
      { url: brandIcon, type: "image/png" }
    ],
    shortcut: [{ url: brandIcon32, sizes: "32x32", type: "image/png" }],
    apple: [{ url: brandIcon192, sizes: "192x192", type: "image/png" }]
  },
  openGraph: {
    title: "ARC Identity",
    description: metadataDescription,
    type: "website",
    url: ARC_PUBLIC_APP_URL,
    images: [
      {
        url: brandWordmark,
        width: 2376,
        height: 621,
        alt: "ARC Identity wordmark"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "ARC Identity",
    description: metadataDescription,
    images: [brandWordmark]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${jakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
