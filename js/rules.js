// Pure game rules. No state, no DOM, no timers.
//
// A "trick" is an array of { seat, card } in the order the cards were played.
// A "view" is any object shaped like the Game (host) or a decoded snapshot (client).
import { PHASE } from './constants.js';

/** The suit that must be followed, or null if there is none (nothing led yet, a Wizard led, or only Jesters so far). */
export function leadSuit(trick) {
  for (const { card } of trick) {
    if (card.kind === 'jester') continue;
    return card.kind === 'wizard' ? null : card.suit;
  }
  return null;
}

/** Indices of the cards in `hand` that may be played to `trick`. */
export function legalMoves(hand, trick) {
  const all = hand.map((_, index) => index);
  const suit = leadSuit(trick);
  if (!suit) return all;
  const canFollow = hand.some((card) => card.kind === 'number' && card.suit === suit);
  if (!canFollow) return all;
  // Wizards and Jesters are always allowed.
  return all.filter((i) => hand[i].kind !== 'number' || hand[i].suit === suit);
}

/** Index (within `trick`) of the winning card. */
export function trickWinner(trick, trump) {
  const firstWizard = trick.findIndex(({ card }) => card.kind === 'wizard');
  if (firstWizard >= 0) return firstWizard;

  const firstNumber = trick.find(({ card }) => card.kind === 'number');
  if (!firstNumber) return 0; // only Jesters: the first one wins

  const highestOfSuit = (suit) => {
    let best = -1;
    trick.forEach(({ card }, index) => {
      const matches = card.kind === 'number' && card.suit === suit;
      if (matches && (best < 0 || card.rank > trick[best].card.rank)) best = index;
    });
    return best;
  };

  if (trump) {
    const trumpWinner = highestOfSuit(trump);
    if (trumpWinner >= 0) return trumpWinner;
  }
  return highestOfSuit(firstNumber.card.suit);
}

/** Exact bid: 20 + 10 per trick. Otherwise -10 per trick missed or won too many. */
export function roundScore(bid, won) {
  return bid === won ? 20 + 10 * won : -10 * Math.abs(bid - won);
}

/**
 * Hook rule: the dealer (who bids last) may not make the total of all bids equal
 * the number of tricks in the round, so at least one player always misses.
 * Returns the bid the dealer is not allowed to make, or null when no bid is blocked.
 */
export function forbiddenBid(view) {
  if (!view.hook || view.phase !== PHASE.BID || view.bidder !== view.dealer) return null;
  const othersTotal = view.players.reduce((sum, player, seat) => (seat === view.bidder ? sum : sum + (player.bid ?? 0)), 0);
  const blocked = view.round - othersTotal;
  return blocked >= 0 && blocked <= view.round ? blocked : null;
}

/**
 * Turn the per-round history into score rows.
 * history[round][seat] = { bid, won }  ->  rows[round][seat] = { bid, won, delta, total }
 */
export function buildScoreRows(history, playerCount) {
  const totals = Array(playerCount).fill(0);
  return history.map((round) =>
    round.map(({ bid, won }, seat) => {
      const delta = roundScore(bid, won);
      totals[seat] += delta;
      return { bid, won, delta, total: totals[seat] };
    })
  );
}
