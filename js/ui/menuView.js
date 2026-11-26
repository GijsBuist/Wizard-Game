// The start screen and the online lobby.
import { MAX_PLAYERS } from '../constants.js';
import { buttonHtml, escapeHtml, hookToggleHtml } from './components.js';

const RULES_HTML = `<details><summary>How to play</summary>
  <p><b>Deck:</b> 60 cards: four suits (Red, Yellow, Green, Blue) numbered 1–13, plus 4 Wizards and 4 Jesters.</p>
  <p><b>Deal:</b> Round 1 deals 1 card each, round 2 deals 2, and so on. The next card in the deck sets the trump suit. A Jester means no trump; a Wizard lets the dealer pick. The final round has no trump.</p>
  <p><b>Bid:</b> Starting left of the dealer, everyone says how many tricks they will win.</p>
  <p><b>Hook rule (optional):</b> the dealer bids last and may not make the total of all bids equal the number of tricks. So at least one player always loses points.</p>
  <p><b>Play:</b> You must follow the suit led if you can. Wizards and Jesters can be played at any time. If a Wizard leads, there is no suit to follow. The first Wizard wins the trick. Without one, the highest trump wins, then the highest card of the led suit. A Jester always loses unless every card is a Jester (then the first wins).</p>
  <p><b>Score:</b> Exact bid: 20 points plus 10 per trick. Otherwise: lose 10 points for every trick you are off.</p></details>`;

/** app: { settings: { bots, hook }, form: { name, code }, menuError } */
export function menuHtml(app) {
  const { bots, hook } = app.settings;
  const players = bots + 1;
  const botButtons = [2, 3, 4, 5].map((count) => buttonHtml(count, 'set-bots', count, count === bots ? '' : 'sec')).join('');
  const error = app.menuError ? `<div class="err">${escapeHtml(app.menuError)}</div>` : '';

  return `<div class="menu">
    <h1 class="title">🧙 Wizard</h1>
    <p>The trick-taking game of bold bids. Predict exactly how many tricks you will win, then make it happen.</p>
    <div class="box"><b>Game rules</b>${hookToggleHtml(hook, true)}</div>
    <div class="box"><b>Play against bots</b>
      <div class="acts">${botButtons}</div>
      <small>${bots} opponents, ${Math.floor(60 / players)} rounds</small>
      ${buttonHtml('Start game', 'start-solo')}</div>
    <div class="box"><b>Play with friends</b>
      <input data-field="name" placeholder="Your name" maxlength="14" value="${escapeHtml(app.form.name)}" aria-label="Your name">
      ${buttonHtml('Create game', 'create-game')}
      <div class="row"><input data-field="code" placeholder="Code" maxlength="4" value="${escapeHtml(app.form.code)}" aria-label="Game code">
        ${buttonHtml('Join', 'join-game', null, 'sec')}</div>
      <small>Up to ${MAX_PLAYERS} players. Empty seats fill with bots so there are always at least 3. Send friends the link to this page and the code.</small>
      ${error}</div>
    ${RULES_HTML}</div>`;
}

/**
 * model: { code, isHost, players: [names], me, hook, botCount, status: { kind, text } }
 * status.kind is 'ready' | 'connecting' | 'error'.
 */
export function lobbyHtml(model) {
  const { status } = model;
  let body;
  if (status.kind !== 'ready') {
    body = `<p class="${status.kind === 'error' ? 'err' : ''}">${escapeHtml(status.text)}</p>`;
  } else {
    const names = model.players
      .map((name, index) => `<li>${escapeHtml(name)}${index === model.me ? ' (you)' : ''}</li>`)
      .join('');
    const botNote = model.botCount
      ? `${model.botCount} bot${model.botCount > 1 ? 's' : ''} will join so there are at least 3 players.`
      : 'No bots needed.';
    body = `<p>${model.isHost ? 'Share this code. Friends open this page, choose Join and enter it.' : 'You are in. Waiting for the host to start.'}</p>
      <ul class="pl">${names}</ul><small>${botNote}</small>
      ${hookToggleHtml(model.hook, model.isHost)}
      ${model.isHost ? buttonHtml('Start game', 'start-online', null, 'big') : ''}`;
  }
  return `<div class="menu"><h1 class="title small-title">🧙 Wizard</h1>
    <div class="code">${escapeHtml(model.code)}</div><div class="box">${body}</div>
    ${buttonHtml('Leave', 'leave', null, 'sec')}</div>`;
}
