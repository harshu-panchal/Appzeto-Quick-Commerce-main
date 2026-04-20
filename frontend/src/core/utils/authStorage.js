import { isTokenExpired } from "./token";

function extractTokenCandidate(rawValue) {
  if (rawValue == null) return null;

  const trimmed = String(rawValue).trim();
  if (!trimmed) return null;

  if (/^bearer\s+/i.test(trimmed)) {
    return trimmed.replace(/^bearer\s+/i, "").trim();
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const nestedToken =
        parsed?.token ||
        parsed?.accessToken ||
        parsed?.jwt ||
        parsed?.result?.token ||
        null;
      return nestedToken ? extractTokenCandidate(nestedToken) : null;
    } catch {
      return trimmed;
    }
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return extractTokenCandidate(trimmed.slice(1, -1));
  }

  return trimmed;
}

export function normalizeStoredToken(rawValue) {
  const token = extractTokenCandidate(rawValue);
  return token ? String(token).trim() : null;
}

export function getStoredAuthToken(storageKey, { allowExpired = false } = {}) {
  const normalized = normalizeStoredToken(localStorage.getItem(storageKey));
  if (!normalized) return null;
  if (!allowExpired && isTokenExpired(normalized)) {
    localStorage.removeItem(storageKey);
    return null;
  }
  return normalized;
}

export function hasValidStoredAuthToken(storageKey) {
  return Boolean(getStoredAuthToken(storageKey));
}
