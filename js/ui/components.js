// Small HTML building blocks shared by the screens. Every function returns a string.
import { SUIT_SYMBOL } from '../constants.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Always escape player-supplied text before putting it into HTML. */
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

const CARD_FACE = {
  wizard: { className: 'wz', label: 'W', symbol: '🧙' },
  jester: { className: 'jt', label: 'J', symbol: '🃏' },
};

/** One face-up card. `attrs` is raw attribute text, e.g. data-action="play". */
export function cardHtml(card, { className = '', width = 68, attrs = '', style = '' } = {}) {
  const face = card.kind === 'number'
    ? { className: 's' + card.suit, label: card.rank, symbol: SUIT_SYMBOL[card.suit] }
    : CARD_FACE[card.kind];
  return `<div class="card ${face.className} ${className}" style="--w:${width}px;${style}" ${attrs}>
    <span class="r">${face.label}</span><i class="sy">${face.symbol}</i><span class="r r2">${face.label}</span></div>`;
}

export const cardBackHtml = (width) => `<div class="card back" style="--w:${width}px"></div>`;

export const buttonHtml = (label, action, value = null, className = '') =>
  `<button class="${className}" data-action="${action}"${value === null ? '' : ` data-value="${value}"`}>${label}</button>`;

/** The hook-rule checkbox. `editable` is false for guests in a lobby. */
export function hookToggleHtml(checked, editable) {
  const label = 'Hook rule: the dealer may not make the total bids equal the tricks, so someone always misses';
  if (!editable) return `<small>${checked ? '✔ ' + label : 'Hook rule is off'}</small>`;
  return `<label class="check"><input type="checkbox" data-action="toggle-hook" ${checked ? 'checked' : ''}> <span>${label}</span></label>`;
}
