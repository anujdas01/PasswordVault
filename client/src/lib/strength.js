export function estimateEntropy(password) {
  if (!password) return 0;
  const freq = {};
  for (const ch of password) freq[ch] = (freq[ch] || 0) + 1;
  const len = password.length;
  let perChar = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    perChar -= p * Math.log2(p);
  }
  return perChar * len;
}

export function strengthRating(password) {
  if (!password) return ['Empty', 0];
  const entropy = estimateEntropy(password);
  if (password.length < 8) return ['Very Weak', 1];
  if (entropy < 35) return ['Weak', 1];
  if (entropy < 60) return ['Fair', 2];
  if (entropy < 90) return ['Strong', 3];
  return ['Very Strong', 4];
}

export const STRENGTH_COLORS = ['#888', '#d64545', '#e0a63c', '#5a9be0', '#2e9e5b'];
export const STRENGTH_LABELS = ['Empty', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
