import type { Metadata } from "next";
import { ArcShell } from "@/components/ArcShell";
import { LandingExperience } from "@/components/landing/LandingExperience";

const landingDescription =
  "Kyro turns wallet history into a verified financial credential: identity scores, verified trust and counterparty checks for the Arc economy.";

export const metadata: Metadata = {
  title: "Kyro | Trust, with a record behind it",
  description: landingDescription,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Kyro | Trust, with a record behind it",
    description: landingDescription,
    type: "website",
    url: "/",
    images: ["/brand/kyro-og.png"]
  }
};

export default function LandingPage() {
  return (
    <ArcShell variant="marketing">
      <LandingExperience />
    </ArcShell>
  );
}
