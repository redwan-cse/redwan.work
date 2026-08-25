export type CrmResult = { ok: true } | { ok: false; error: string };

export function crmError(message: string): CrmResult {
  return { ok: false, error: message };
}
