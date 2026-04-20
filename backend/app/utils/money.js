/**
 * Finance helpers.
 * Internally compute in paise to avoid floating-point drift.
 */

export function toPaise(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromPaise(paise) {
  const num = Number(paise || 0);
  if (!Number.isFinite(num)) return 0;
  return Number((num / 100).toFixed(2));
}

export function roundCurrency(value) {
  return fromPaise(toPaise(value));
}

export function addMoney(...values) {
  const totalPaise = values.reduce((sum, value) => sum + toPaise(value), 0);
  return fromPaise(totalPaise);
}

export function subtractMoney(minuend, ...subtrahends) {
  const totalPaise = subtrahends.reduce(
    (sum, value) => sum + toPaise(value),
    toPaise(minuend),
  );
  return fromPaise(totalPaise);
}

export function multiplyMoney(value, multiplier) {
  return fromPaise(toPaise(value) * Number(multiplier || 0));
}

export function percentOf(value, ratePercent) {
  const basePaise = toPaise(value);
  const pct = Number(ratePercent || 0);
  if (!Number.isFinite(pct)) return 0;
  return fromPaise(Math.round((basePaise * pct) / 100));
}

export function clampMoney(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return roundCurrency(Math.min(Math.max(Number(value || 0), min), max));
}

export function ceilKm(valueKm) {
  const num = Number(valueKm || 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.ceil(num);
}
