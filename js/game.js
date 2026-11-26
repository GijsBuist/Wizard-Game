// The game engine. It runs on the host's machine (or on the only machine in solo play).
// It owns all hidden information and rejects any move that breaks the rules.
import { ACTION, DECK_SIZE, PHASE, SUITS, TIMING } from './constants.js';
import { createDeck, shuffle, sortHand } from './cards.js';
import { forbiddenBid, legalMoves, roundScore, trickWinner } from './rules.js';
import { chooseBid, chooseCard, chooseTrump } from './bots.js';

export class Game {
  /**
   * @param players      [{ name, token, human }] in seating order
   * @param hook         enable the hook rule (see rules.forbiddenBid)
   * @param viewerToken  token of the person looking at this machine (sets `this.me`)
   * @param onChange     called after every state change so the UI can redraw
   */
  constructor({ players, hook = false, viewerToken = null, onChange = () => {}, timing = {}, random = Math.random }) {
    this.players = players.map((p) => ({ name: p.name, token: p.token || '', human: p.human, hand: [], bid: null, tricks: 0, score: 0 }));
    this.n = this.players.length;
    this.rounds = Math.floor(DECK_SIZE / this.n);
    this.hook = hook;
    this.timing = { ...TIMING, ...timing };
    this.onChange = onChange;
    this.random = random;
    this.me = viewerToken ? this.seatOfHuman(viewerToken) : -1;

    this.round = 0;
    this.dealer = Math.floor(random() * this.n);
    this.phase = null;
    this.bidder = null; // seat that is bidding now
    this.turn = null; // seat that plays next
    this.lastWin = null; // seat that won the last trick
    this.trump = null;
    this.trumpCard = null;
    this.trick = []; // [{ seat, card }]
    this.history = []; // history[round][seat] = { bid, won }

    this.bidsPlaced = 0;
    this.timers = new Set();
    this.destroyed = false;
  }

  // ----- public API -----

  start() {
    this.#startRound();
  }

  /** Stop all pending timers. Call when the game is thrown away. */
  destroy() {
    this.destroyed = true;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  seatOfHuman(token) {
    return this.players.findIndex((p) => p.human && p.token === token);
  }

  /** A human player asks to do something. Returns true if it was legal and has been applied. */
  act(seat, action) {
    const player = this.players[seat];
    if (!player || !player.human || !action || typeof action !== 'object') return false;
    switch (action.type) {
      case ACTION.BID:
        return this.#tryBid(seat, action.value);
      case ACTION.TRUMP:
        return this.#tryTrump(seat, action.value);
      case ACTION.PLAY:
        return this.#tryPlay(seat, action.value);
      case ACTION.NEXT:
        return this.#tryNextRound();
      default:
        return false;
    }
  }

  /** Replace a human (for example one who disconnected) with a bot and carry on. */
  takeOver(seat) {
    const player = this.players[seat];
    if (!player || !player.human) return;
    player.human = false;
    player.name += ' (bot)';
    if (this.phase === PHASE.TRUMP && this.dealer === seat) {
      this.trump = chooseTrump(player.hand, this.random);
      this.#nextBid();
    } else if (this.phase === PHASE.BID && this.bidder === seat) {
      this.#nextBid();
    } else if (this.phase === PHASE.PLAY && this.turn === seat) {
      this.#playTurn();
    } else {
      this.onChange();
    }
  }

  // ----- validation of human moves -----

  #tryBid(seat, value) {
    const valid = this.phase === PHASE.BID && this.bidder === seat && Number.isInteger(value) && value >= 0 && value <= this.round;
    if (!valid || value === forbiddenBid(this)) return false;
    this.#placeBid(seat, value);
    return true;
  }

  #tryTrump(seat, suit) {
    if (this.phase !== PHASE.TRUMP || this.dealer !== seat || !SUITS.includes(suit)) return false;
    this.trump = suit;
    this.#nextBid();
    return true;
  }

  #tryPlay(seat, index) {
    const hand = this.players[seat].hand;
    const valid = this.phase === PHASE.PLAY && this.turn === seat && Number.isInteger(index) && index >= 0 && index < hand.length;
    if (!valid || !legalMoves(hand, this.trick).includes(index)) return false;
    this.#playCard(seat, index);
    return true;
  }

  #tryNextRound() {
    if (this.phase !== PHASE.END || this.round >= this.rounds) return false;
    this.#startRound();
    return true;
  }

  // ----- round flow -----

  #startRound() {
    this.round++;
    this.dealer = (this.dealer + 1) % this.n;
    const deck = shuffle(createDeck(), this.random);
    for (const player of this.players) {
      player.hand = sortHand(deck.splice(0, this.round));
      player.bid = null;
      player.tricks = 0;
    }
    this.trick = [];
    this.trump = null;
    this.trumpCard = null;
    this.bidsPlaced = 0;

    // The next card of the deck sets trump. No card left (last round) means no trump.
    if (deck.length > 0) {
      this.trumpCard = deck[0];
      if (this.trumpCard.kind === 'number') {
        this.trump = this.trumpCard.suit;
      } else if (this.trumpCard.kind === 'wizard') {
        const dealer = this.players[this.dealer];
        if (dealer.human) {
          this.phase = PHASE.TRUMP;
          this.onChange();
          return;
        }
        this.trump = chooseTrump(dealer.hand, this.random);
      } // a Jester means no trump
    }
    this.#nextBid();
  }

  #nextBid() {
    if (this.bidsPlaced >= this.n) {
      this.turn = (this.dealer + 1) % this.n;
      this.#playTurn();
      return;
    }
    const seat = (this.dealer + 1 + this.bidsPlaced) % this.n;
    const player = this.players[seat];
    this.phase = PHASE.BID;
    this.bidder = seat;
    this.onChange();
    if (!player.human) {
      this.#later(() => this.#placeBid(seat, chooseBid(player.hand, this.trump, forbiddenBid(this), this.random)), this.timing.bot_bid);
    }
  }

  #placeBid(seat, bid) {
    this.players[seat].bid = bid;
    this.bidsPlaced++;
    this.#nextBid();
  }

  #playTurn() {
    if (this.trick.length === this.n) {
      this.#finishTrick();
      return;
    }
    const seat = this.turn;
    const player = this.players[seat];
    this.phase = PHASE.PLAY;
    this.onChange();
    if (!player.human) {
      const choice = () => chooseCard({ hand: player.hand, trick: this.trick, trump: this.trump, bid: player.bid, tricksWon: player.tricks, seat });
      this.#later(() => this.#playCard(seat, choice()), this.timing.bot_play);
    }
  }

  #playCard(seat, index) {
    const [card] = this.players[seat].hand.splice(index, 1);
    this.trick.push({ seat, card });
    this.turn = (seat + 1) % this.n;
    this.#playTurn();
  }

  #finishTrick() {
    const winner = this.trick[trickWinner(this.trick, this.trump)].seat;
    this.players[winner].tricks++;
    this.lastWin = winner;
    this.phase = PHASE.RESOLVE;
    this.onChange();
    // Leave the finished trick on the table for a moment.
    this.#later(() => {
      this.trick = [];
      this.turn = winner;
      if (this.players.every((p) => p.hand.length === 0)) this.#endRound();
      else this.#playTurn();
    }, this.timing.trick_pause);
  }

  #endRound() {
    for (const player of this.players) player.score += roundScore(player.bid, player.tricks);
    this.history.push(this.players.map((p) => ({ bid: p.bid, won: p.tricks })));
    this.phase = PHASE.END;
    this.onChange();
  }

  #later(callback, ms) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.destroyed) callback();
    }, ms);
    this.timers.add(id);
  }
}
