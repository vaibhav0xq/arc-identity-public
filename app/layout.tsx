import type { Metadata } from "next";
import { Newsreader, Plus_Jakarta_Sans, DM_Mono } from "next/font/google";
import { ARC_PUBLIC_APP_URL } from "@/lib/links";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap"
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap"
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap"
});

const metadataDescription = "Payments are solved, trust isn't. Kyro is an onchain reputation and wallet intelligence platform for Arc stablecoin users - transaction-verified trust scoring, multichain analytics and portable identity.";
const brandIcon = "/brand/kyro-icon-512.png";
const brandIcon32 = "/brand/kyro-icon-32.png";
const brandIcon192 = "/brand/kyro-icon-192.png";
const brandIcon512 = "/brand/kyro-icon-512.png";
const brandIconSvg = "/brand/kyro-tile-site.svg";
const brandOgImage = "/brand/kyro-og.png";

export const metadata: Metadata = {
  metadataBase: new URL(ARC_PUBLIC_APP_URL),
  title: "Kyro",
  description: metadataDescription,
  alternates: {
    canonical: "/"
  },
  icons: {
    icon: [
      { url: brandIcon32, sizes: "32x32", type: "image/png" },
      { url: brandIcon192, sizes: "192x192", type: "image/png" },
      { url: brandIcon512, sizes: "512x512", type: "image/png" },
      { url: brandIconSvg, type: "image/svg+xml" },
      { url: brandIcon, type: "image/png" }
    ],
    shortcut: [{ url: brandIcon32, sizes: "32x32", type: "image/png" }],
    apple: [{ url: brandIcon192, sizes: "192x192", type: "image/png" }]
  },
  openGraph: {
    title: "Kyro",
    description: metadataDescription,
    type: "website",
    url: ARC_PUBLIC_APP_URL,
    images: [
      {
        url: brandOgImage,
        width: 1200,
        height: 630,
        alt: "Kyro: onchain reputation and wallet intelligence"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Kyro",
    description: metadataDescription,
    images: [brandOgImage]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${jakarta.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
