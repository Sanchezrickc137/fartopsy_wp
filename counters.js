// Shared numeric guard used by the animated display; no remote services.
export const validCount = value => Number.isSafeInteger(value) && value >= 0;
