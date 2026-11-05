// Shared by the server (mail filter) and the browser (follow-ups).
/** True when an address matches a hidden sender or hidden domain. */
export function isHidden(address: string, hidden: string[]): boolean {
  const a = address.toLowerCase();
  const domain = a.slice(a.indexOf("@"));
  return hidden.some((h) => h === a || (h.startsWith("@") && (domain === h || domain.endsWith(`.${h.slice(1)}`))));
}
