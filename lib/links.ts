export const ARC_FEEDBACK_FORM_URL = "https://forms.gle/YBUjp2xaBzK1KvUo6";
export const ARC_GITHUB_REPO_URL = "https://github.com/vaibhav0xq/kyro-public";
export const ARC_TWITTER_URL = "https://x.com/KyroIdentity";
export const ARC_SUPPORT_EMAIL = "arcidentity.build@gmail.com";
export const ARC_PUBLIC_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.thekyro.co").replace(/\/$/, "");

export function publicAppUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ARC_PUBLIC_APP_URL}${normalizedPath}`;
}
