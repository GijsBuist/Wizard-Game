// What the host sends to each connected player.
//
// A snapshot is personal: it contains the receiving player's own hand only. Other hands are
// reduced to a card count, so nobody can read them from the network traffic. Player tokens
// never leave the host.
import { decodeCard, encodeCard } from './cards.js';
import { sanitizeName } from './util.js';

/** Snapshot of a running game for the player in `seat`. */
export function snapshotGame(game, seat) {
  return {
    phase: game.phase,
    round: game.round,
    rounds: game.rounds,
    dealer: game.dealer,
    bidder: game.bidder,
    turn: game.turn,
    lastWin: game.lastWin,
    trump: game.trump,
    trumpCard: game.trumpCard ? encodeCard(game.trumpCard) : null,
    hook: game.hook,
    me: seat,
    players: game.players.map((p, index) => ({
      name: p.name,
      human: p.human,
      bid: p.bid,
      tricks: p.tricks,
      score: p.score,
      count: p.hand.length,
      cards: index === seat ? p.hand.map(encodeCard) : null,
    })),
    trick: game.trick.map(({ seat: playedBy, card }) => [playedBy, encodeCard(card)]),
    history: game.history.map((round) => round.map(({ bid, won }) => [bid, won])),
  };
}

/** Snapshot shown while players are still gathering. */
export function snapshotLobby(names, me, hook) {
  return { phase: 'lobby', players: names, me, hook };
}

/**
 * Rebuild a Game-shaped object from a snapshot (client side).
 * Opponents' `hand` is an array of nulls, only its length is meaningful.
 * Throws on malformed data, so callers must catch.
 */
export function viewFromSnapshot(s) {
  if (!s || !Array.isArray(s.players) || !Array.isArray(s.trick) || !Array.isArray(s.history)) throw new Error('Malformed state');
  if (!Number.isInteger(s.me) || s.me < 0 || s.me >= s.players.length) throw new Error('Not seated');

  const players = s.players.map((p) => ({
    name: sanitizeName(p.name),
    human: !!p.human,
    bid: p.bid,
    tricks: p.tricks,
    score: p.score,
    hand: Array.isArray(p.cards) ? p.cards.map(decodeCard) : Array(Math.min(20, Math.max(0, p.count | 0))).fill(null),
  }));

  return {
    phase: s.phase,
    round: s.round,
    rounds: s.rounds,
    dealer: s.dealer,
    bidder: s.bidder,
    turn: s.turn,
    lastWin: s.lastWin,
    trump: s.trump,
    trumpCard: s.trumpCard ? decodeCard(s.trumpCard) : null,
    hook: !!s.hook,
    me: s.me,
    n: players.length,
    players,
    trick: s.trick.map(([seat, code]) => ({ seat, card: decodeCard(code) })),
    history: s.history.map((round) => round.map(([bid, won]) => ({ bid, won }))),
  };
}
