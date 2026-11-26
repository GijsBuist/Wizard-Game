// Computer players. Pure functions: they look at their own hand and the table only.
import { SUITS } from './constants.js';
import { legalMoves, trickWinner } from './rules.js';
import { clamp } from './util.js';

/** Rough number of tricks a hand should win. */
function estimateTricks(hand, trump) {
  let estimate = 0;
  for (const card of hand) {
    if (card.kind === 'wizard') estimate += 1;
    else if (card.kind === 'number' && card.suit === trump) {
      estimate += card.rank >= 11 ? 0.9 : card.rank >= 8 ? 0.6 : card.rank >= 5 ? 0.3 : 0.12;
    } else if (card.kind === 'number') {
      estimate += card.rank === 13 ? 0.55 : card.rank === 12 ? 0.35 : card.rank === 11 ? 0.15 : 0;
    }
  }
  return estimate;
}

/** `forbidden` is a bid the bot may not make (hook rule), or null. */
export function chooseBid(hand, trump, forbidden = null, random = Math.random) {
  const estimate = estimateTricks(hand, trump);
  const wobble = random() < 0.25 ? (random() < 0.5 ? -1 : 1) : 0;
  const bid = clamp(Math.round(estimate) + wobble, 0, hand.length);
  if (bid !== forbidden) return bid;

  // Move to the neighbouring bid that is closest to what the hand is really worth.
  const preferred = estimate >= bid ? [bid + 1, bid - 1] : [bid - 1, bid + 1];
  return preferred.find((candidate) => candidate >= 0 && candidate <= hand.length);
}

/** Trump when a Wizard is turned up: the suit the hand is strongest in. */
export function chooseTrump(hand, random = Math.random) {
  const strength = Object.fromEntries(SUITS.map((suit) => [suit, 0]));
  for (const card of hand) if (card.kind === 'number') strength[card.suit] += 1 + card.rank / 13;
  const best = Math.max(...SUITS.map((suit) => strength[suit]));
  if (best <= 0) return SUITS[Math.floor(random() * SUITS.length)];
  return SUITS.find((suit) => strength[suit] === best);
}

const cardPower = (card, trump) => {
  if (card.kind === 'wizard') return 1000;
  if (card.kind === 'jester') return 0;
  return (card.suit === trump ? 100 : 0) + card.rank;
};

/**
 * Pick a card to play (returns an index into `hand`).
 * Needs tricks: win cheaply. Has enough: lose with the highest card that still loses.
 */
export function chooseCard({ hand, trick, trump, bid, tricksWon, seat }) {
  const wantsTrick = bid > tricksWon;
  const options = legalMoves(hand, trick)
    .map((index) => {
      const card = hand[index];
      const withCard = [...trick, { seat, card }];
      return {
        index,
        power: cardPower(card, trump),
        wins: trickWinner(withCard, trump) === withCard.length - 1,
        isJester: card.kind === 'jester',
      };
    })
    .sort((a, b) => a.power - b.power);

  if (wantsTrick) {
    if (trick.length === 0) return options[options.length - 1].index; // lead strong
    const cheapWinners = options.filter((o) => o.wins && !o.isJester);
    return (cheapWinners[0] || options[0]).index;
  }
  const safe = options.filter((o) => !o.wins);
  return (safe.length ? safe[safe.length - 1] : options[0]).index;
}
