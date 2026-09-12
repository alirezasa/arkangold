export function maskSensitive(
  value: string | undefined | null,
  visibleStart = 0,
  visibleEnd = 4,
): string {
  if (!value) return '';
  if (value.length <= visibleStart + visibleEnd)
    return '*'.repeat(value.length);
  return (
    value.slice(0, visibleStart) +
    '*'.repeat(value.length - visibleStart - visibleEnd) +
    value.slice(value.length - visibleEnd)
  );
}

export function maskNationalCode(
  nationalCode: string | undefined | null,
): string {
  return maskSensitive(nationalCode, 0, 3);
}

export function maskCardNumber(cardNumber: string | undefined | null): string {
  return maskSensitive(cardNumber?.replace(/\s/g, ''), 0, 4);
}

export function maskSecret(secret: string | undefined | null): string {
  return maskSensitive(secret, 0, 4);
}
