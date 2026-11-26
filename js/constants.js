// Shared constants. Nothing in here has behaviour.

export const SUITS = ['R', 'Y', 'G', 'B'];
export const SUIT_SYMBOL = { R: '♥', Y: '♦', G: '♣', B: '♠' };
export const SUIT_NAME = { R: 'Red', Y: 'Yellow', G: 'Green', B: 'Blue' };

export const DECK_SIZE = 60;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const BOT_NAMES = ['Merlin', 'Gandalf', 'Morgana', 'Oz', 'Elphaba'];

export const PHASE = {
  TRUMP: 'trump', // the dealer must choose a trump suit (a Wizard was turned up)
  BID: 'bid',
  PLAY: 'play',
  RESOLVE: 'resolve', // a trick is complete and shown briefly
  END: 'end', // round (or game) finished
};

// Things a human player can ask the game to do.
export const ACTION = { BID: 'bid', TRUMP: 'trump', PLAY: 'play', NEXT: 'next' };

// Pauses (ms) that make bot turns readable.
export const TIMING = { bot_bid: 750, bot_play: 850, trick_pause: 1600 };

// Online play
export const CODE_LENGTH = 4;
export const ABSENT_TAKEOVER_MS = 12000; // a disconnected player is replaced by a bot after this
export const CONNECT_TIMEOUT_MS = 12000;
