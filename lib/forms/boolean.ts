export function parseFormBoolean(formData: FormData, key: string): boolean {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === 'on' || normalized === '1';
}
