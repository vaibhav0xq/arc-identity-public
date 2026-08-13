import { ARC_FEEDBACK_FORM_URL } from "@/lib/links";

type ReportIssueLinkProps = {
  helperText?: string;
  className?: string;
};

export function ReportIssueLink({ helperText, className = "" }: ReportIssueLinkProps) {
  return (
    <a
      href={ARC_FEEDBACK_FORM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Report a Kyro identity issue"
      className={className}
    >
      <span>Report issue</span>
      {helperText ? <span className="block text-xs font-medium text-slate-500">{helperText}</span> : null}
    </a>
  );
}
