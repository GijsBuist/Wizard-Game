// Card model.   { kind: 'number', suit, rank } | { kind: 'wizard' } | { kind: 'jester' }
import { SUITS } from './constants.js';

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ kind: 'number', suit, rank });
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ kind: 'wizard' });
    deck.push({ kind: 'jester' });
  }
  return deck;
}

/** Fisher-Yates shuffle, in place. */
export function shuffle(items, random = Math.random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Wizards first, then each suit from high to low, Jesters last. */
export function sortHand(hand) {
  const key = (card) => {
    if (card.kind === 'wizard') return 0;
    if (card.kind === 'jester') return 500;
    return 10 + SUITS.indexOf(card.suit) * 20 + (14 - card.rank);
  };
  return hand.sort((a, b) => key(a) - key(b));
}

// Compact text form used when sending cards over the network: "R12", "W", "J".
export function encodeCard(card) {
  if (card.kind === 'wizard') return 'W';
  if (card.kind === 'jester') return 'J';
  return card.suit + card.rank;
}

export function decodeCard(code) {
  if (code === 'W') return { kind: 'wizard' };
  if (code === 'J') return { kind: 'jester' };
  const suit = typeof code === 'string' ? code[0] : '';
  const rank = Number(String(code).slice(1));
  if (!SUITS.includes(suit) || !Number.isInteger(rank) || rank < 1 || rank > 13) {
    throw new Error('Invalid card: ' + code);
  }
  return { kind: 'number', suit, rank };
}
