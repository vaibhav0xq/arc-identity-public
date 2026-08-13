/* Client-side CSV builder for batch check exports.

   Two safety rules, both mandatory:
   - RFC 4180 quoting: any cell containing a quote, comma or newline is
     wrapped in double quotes with internal quotes doubled.
   - Formula-injection guard: cells starting with = + - @ (or a tab/CR) get a
     leading apostrophe so spreadsheet apps render them as text instead of
     executing them. Wallet lists get pasted into Excel/Sheets constantly —
     a malicious username must never become a live formula. */

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function csvCell(raw: string | number | null | undefined): string {
  let value = raw === null || raw === undefined ? "" : String(raw);
  if (value.length > 0 && FORMULA_TRIGGERS.has(value[0])) {
    value = `'${value}`;
  }
  if (/[",\r\n]/.test(value)) {
    value = `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
