import type { RiskLevel } from "@/lib/types";

/* Score display helpers for the app surface. The bands match the public
   score contract; the scoring math itself runs in the hosted service. */

export function getRiskLevel(score: number): RiskLevel {
  if (score <= 30) return "High Risk";
  if (score <= 55) return "New / Unproven";
  if (score <= 75) return "Reliable";
  return "Trusted";
}

export function getBadge(score: number) {
  if (score <= 30) return "Protected Review Required";
  if (score <= 55) return "Emerging Credential";
  if (score <= 75) return "Reliable Wallet Credential";
  return "Trusted Wallet Credential";
}

export function getRecommendedAction(score: number) {
  if (score <= 30) return "High risk - avoid or require protection";
  if (score <= 55) return "Use caution - limit amount";
  if (score <= 75) return "Standard interaction";
  return "Trusted - safe for normal use";
}

export function getDecisionRecommendations(score: number) {
  if (score <= 30) return { risk: "High", sendMoney: "Require escrow or protection", lending: "Decline credit", highValueDeal: "Avoid without guarantees" };
  if (score <= 55) return { risk: "Medium", sendMoney: "Limit amount", lending: "Manual review", highValueDeal: "Enhanced verification" };
  if (score <= 75) return { risk: "Moderate", sendMoney: "Safe for standard transfers", lending: "Small limits", highValueDeal: "Standard verification" };
  return { risk: "Low", sendMoney: "Safe", lending: "Small limits approved", highValueDeal: "Standard verification" };
}
