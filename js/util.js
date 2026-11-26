export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const randomId = () => Math.random().toString(36).slice(2, 10);

/** Trim, strip control characters and shorten a player-supplied name. */
export function sanitizeName(value, fallback = 'Player') {
  const cleaned = typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 14) : '';
  return cleaned || fallback;
}

/**
 * A random id that identifies this browser tab, so a reload can reclaim its seat.
 * It never leaves the host's machine, other players only see seat numbers.
 */
export function getPlayerToken(storage) {
  try {
    let token = storage.getItem('wizard-token');
    if (!token) {
      token = randomId();
      storage.setItem('wizard-token', token);
    }
    return token;
  } catch (error) {
    return randomId();
  }
}
