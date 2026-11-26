// The table: opponents, trick, your hand and the modal dialogs.
// Everything here only reads from `view` (a Game on the host, a decoded snapshot on a client).
import { PHASE, SUITS, SUIT_NAME, SUIT_SYMBOL } from '../constants.js';
import { buildScoreRows, forbiddenBid, leadSuit, legalMoves } from '../rules.js';
import { buttonHtml, cardBackHtml, cardHtml, escapeHtml } from './components.js';

const seatName = (view, seat) => (seat === view.me ? 'You' : view.players[seat].name);
const safeName = (view, seat) => escapeHtml(seatName(view, seat));
const isGameOver = (view) => view.phase === PHASE.END && view.round >= view.rounds;
const signed = (n) => (n > 0 ? '+' + n : String(n));

/**
 * model: { view, mode: 'solo' | 'online', isHost, code, showScoreboard, width }
 */
export function gameHtml(model) {
  const { view } = model;
  return [
    headerHtml(model),
    infoHtml(model),
    opponentsHtml(view),
    tableHtml(view, model.width),
    selfHtml(view),
    handHtml(view, model.width),
    modalHtml(model),
  ].join('');
}

function headerHtml({ mode }) {
  return `<header><h1>🧙 Wizard</h1>${buttonHtml('Scoreboard', 'show-scoreboard', null, 'sec')}
    ${buttonHtml(mode === 'online' ? 'Leave' : 'New game', 'leave', null, 'sec')}</header>`;
}

function infoHtml({ view, code }) {
  const cards = `${view.round} card${view.round > 1 ? 's' : ''} each`;
  const parts = [`Round ${view.round} of ${view.rounds}, ${cards}. Dealer: ${safeName(view, view.dealer)}`];
  if (code) parts.push(`Game code ${escapeHtml(code)}`);
  const hook = view.hook ? ` <span class="badge" title="The dealer may not make total bids equal the number of tricks">Hook rule</span>` : '';
  return `<div class="info">${parts.join('. ')}${hook}</div>`;
}

function isActive(view, seat) {
  return (view.phase === PHASE.BID && view.bidder === seat) || (view.phase === PHASE.PLAY && view.turn === seat);
}

function opponentsHtml(view) {
  let html = '';
  for (let step = 1; step < view.n; step++) {
    const seat = (view.me + step) % view.n; // seats in table order, starting left of you
    const p = view.players[seat];
    html += `<div class="opp ${isActive(view, seat) ? 'act' : ''}">
      <b>${escapeHtml(p.name)}${p.human ? '' : ' 🤖'}</b>
      <span>Bid ${p.bid ?? '–'}, won ${p.tricks}</span><br><small>Score ${p.score}</small>
      <div class="bk">${cardBackHtml(26)}<small>×${p.hand.length}</small></div></div>`;
  }
  return `<div class="opps">${html}</div>`;
}

function trumpHtml(view) {
  let text;
  if (view.trump) text = `Trump: <b style="color:var(--${view.trump})">${SUIT_SYMBOL[view.trump]} ${SUIT_NAME[view.trump]}</b>`;
  else if (view.trumpCard && view.trumpCard.kind === 'wizard') text = 'A Wizard was turned up: choosing trump…';
  else text = view.trumpCard ? 'No trump: a Jester was turned up' : 'No trump in the final round';
  const card = view.trumpCard ? cardHtml(view.trumpCard, { width: 34 }) : '';
  return `<div class="trump">${card}<span>${text}</span></div>`;
}

function statusText(view) {
  const me = view.me;
  switch (view.phase) {
    case PHASE.TRUMP:
      return view.dealer === me ? 'A Wizard was turned up. As dealer, choose the trump suit.' : `${safeName(view, view.dealer)} is choosing the trump suit…`;
    case PHASE.BID: {
      if (view.bidder !== me) return `${safeName(view, view.bidder)} is bidding…`;
      const blocked = forbiddenBid(view);
      const note = blocked === null ? '' : ` You can't bid ${blocked}: the total of all bids can't equal ${view.round}.`;
      return `Your bid: how many tricks will you win?${note}`;
    }
    case PHASE.PLAY: {
      if (view.turn !== me) return `${safeName(view, view.turn)} is playing…`;
      const suit = leadSuit(view.trick);
      if (!view.trick.length) return 'You lead. Play any card.';
      return suit ? `Your turn. Follow ${SUIT_NAME[suit]} if you can (Wizards and Jesters are always allowed).` : 'Your turn. Play any card.';
    }
    case PHASE.RESOLVE:
      return view.lastWin === me ? 'You win the trick' : `${safeName(view, view.lastWin)} wins the trick`;
    default:
      return '';
  }
}

function controlsHtml(view) {
  if (view.phase === PHASE.BID && view.bidder === view.me) {
    const blocked = forbiddenBid(view);
    const buttons = Array.from({ length: view.round + 1 }, (_, bid) =>
      bid === blocked
        ? `<button class="forbidden" disabled title="Hook rule: not allowed">${bid}</button>`
        : buttonHtml(bid, 'bid', bid)
    );
    return `<span>Bid:</span>${buttons.join('')}`;
  }
  if (view.phase === PHASE.TRUMP && view.dealer === view.me) {
    return SUITS.map((suit) => `<button data-action="trump" data-value="${suit}" style="background:var(--${suit});color:#fff">${SUIT_SYMBOL[suit]} ${SUIT_NAME[suit]}</button>`).join('');
  }
  return '';
}

function tableHtml(view, width) {
  const cardWidth = width < 600 ? 54 : 68;
  const trick = view.trick.map(({ seat, card }) => {
    const won = view.phase === PHASE.RESOLVE && view.lastWin === seat;
    return `<div class="tc ${won ? 'win' : ''}">${cardHtml(card, { width: cardWidth })}<div>${safeName(view, seat)}</div></div>`;
  }).join('');
  return `<div class="table">${trumpHtml(view)}<div class="trick">${trick}</div>
    <div class="msg">${statusText(view)}</div><div class="acts">${controlsHtml(view)}</div></div>`;
}

function selfHtml(view) {
  const me = view.players[view.me];
  return `<div class="me ${isActive(view, view.me) ? 'act' : ''}"><b>${escapeHtml(me.name)} (you)</b>
    <span>Bid ${me.bid ?? '–'}, won ${me.tricks}</span><span>Score ${me.score}</span></div>`;
}

function handHtml(view, width) {
  const hand = view.players[view.me].hand;
  const cardWidth = width < 600 ? 54 : 70;
  const available = Math.min(width, 1000) - 40;
  // Overlap the cards when the hand is too wide for the screen.
  const step = hand.length > 1 ? Math.min(cardWidth + 8, (available - cardWidth) / (hand.length - 1)) : 0;
  const myTurn = view.phase === PHASE.PLAY && view.turn === view.me;
  const playable = myTurn ? legalMoves(hand, view.trick) : [];

  const cards = hand.map((card, index) => {
    const ok = playable.includes(index);
    return cardHtml(card, {
      width: cardWidth,
      className: myTurn ? (ok ? 'ok' : 'dis') : '',
      style: `margin-left:${index ? step - cardWidth : 0}px`,
      attrs: ok ? `data-action="play" data-value="${index}"` : '',
    });
  }).join('');
  return `<div class="hand">${cards}</div>`;
}

// ----- dialogs -----

function scoreTableHtml(view) {
  const rows = buildScoreRows(view.history, view.n);
  if (!rows.length) return '<p>No rounds finished yet.</p>';
  const head = view.players.map((_, seat) => `<th>${safeName(view, seat)}</th>`).join('');
  const body = rows.map((round, index) => {
    const cells = round.map((r) => `<td>${r.bid}→${r.won} <small class="${r.delta >= 0 ? 'pos' : 'neg'}">${signed(r.delta)}</small><br><b>${r.total}</b></td>`).join('');
    return `<tr><td>${index + 1}</td>${cells}</tr>`;
  }).join('');
  return `<table><tr><th>Round</th>${head}</tr>${body}</table>
    <small>Each cell: bid→tricks won, points for the round, then running total.</small>`;
}

function roundResultHtml(view) {
  const last = buildScoreRows(view.history, view.n).pop();
  const rows = view.players.map((_, seat) => `<tr><td>${safeName(view, seat)}</td><td>${last[seat].bid}</td><td>${last[seat].won}</td>
    <td class="${last[seat].delta >= 0 ? 'pos' : 'neg'}">${signed(last[seat].delta)}</td><td><b>${last[seat].total}</b></td></tr>`).join('');
  return `<h2>Round ${view.round} of ${view.rounds}</h2>
    <table><tr><th>Player</th><th>Bid</th><th>Won</th><th>Points</th><th>Total</th></tr>${rows}</table>
    <div class="acts">${buttonHtml('Full scoreboard', 'show-scoreboard', null, 'sec')}${buttonHtml('Next round', 'next')}</div>`;
}

function gameOverHtml({ view, mode, isHost }) {
  const best = Math.max(...view.players.map((p) => p.score));
  const winners = view.players.map((_, seat) => seat).filter((seat) => view.players[seat].score === best);
  const title = winners.includes(view.me) ? (winners.length > 1 ? 'A shared victory!' : 'You win!') : `${safeName(view, winners[0])} wins`;
  const ranking = view.players.map((_, seat) => seat).sort((a, b) => view.players[b].score - view.players[a].score);
  const rows = ranking.map((seat, rank) => `<tr><td>${rank + 1}</td><td>${safeName(view, seat)}</td><td><b>${view.players[seat].score}</b></td></tr>`).join('');

  let again;
  if (mode === 'solo') again = buttonHtml('Play again', 'play-again');
  else again = isHost ? buttonHtml('Back to lobby', 'back-to-lobby') : '<small>Waiting for the host…</small>';
  return `<h2>${title}</h2><table><tr><th>Rank</th><th>Player</th><th>Score</th></tr>${rows}</table>
    <div class="acts">${buttonHtml('Scoreboard', 'show-scoreboard', null, 'sec')}${again}${buttonHtml('Leave', 'leave', null, 'sec')}</div>`;
}

function modalHtml(model) {
  const { view } = model;
  let content = '';
  if (model.showScoreboard) {
    content = `<h2>Scoreboard</h2>${scoreTableHtml(view)}<div class="acts">${buttonHtml('Close', 'hide-scoreboard')}</div>`;
  } else if (isGameOver(view)) {
    content = gameOverHtml(model);
  } else if (view.phase === PHASE.END) {
    content = roundResultHtml(view);
  }
  return content ? `<div class="ov"><div class="md">${content}</div></div>` : '';
}
