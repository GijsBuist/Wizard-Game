// Builds the list of seats for a new game: humans plus bots.
import { BOT_NAMES } from './constants.js';
import { shuffle } from './cards.js';

/** humans: [{ name, token }]. Returns [{ name, token, human }]. */
export function createLineup(humans, botCount, { shuffleSeats = false } = {}) {
  const seats = humans.map(({ name, token }) => ({ name, token, human: true }));
  for (let i = 0; i < botCount; i++) seats.push({ name: BOT_NAMES[i], token: '', human: false });
  return shuffleSeats ? shuffle(seats) : seats;
}
