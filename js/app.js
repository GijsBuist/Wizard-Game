// The application controller: owns the screen state, wires the engine, the network and the UI together.
import { ABSENT_TAKEOVER_MS, ACTION, CODE_LENGTH, MAX_PLAYERS, MIN_PLAYERS } from './constants.js';
import { Game } from './game.js';
import { createLineup } from './lineup.js';
import { ClientSession, HostSession, makeGameCode, normalizeCode } from './network.js';
import { snapshotGame, snapshotLobby, viewFromSnapshot } from './snapshot.js';
import { clamp, getPlayerToken, sanitizeName } from './util.js';
import { gameHtml } from './ui/gameView.js';
import { lobbyHtml, menuHtml } from './ui/menuView.js';

const REJECTION_TEXT = { started: 'This game has already started.', full: `This game is full (${MAX_PLAYERS} players).` };

/**
 * @param root              element the UI is drawn into
 * @param PeerClass         PeerJS' Peer (undefined if the library failed to load)
 * @param storage           sessionStorage-like object
 * @param getViewportWidth  () => number
 * @param timing            optional overrides for bot pauses (used by tests)
 */
export function createApp({ root, PeerClass, storage, getViewportWidth = () => 1000, timing = {} }) {
  const token = getPlayerToken(storage);

  // screen: 'menu' | 'lobby' | 'game'      mode: 'solo' | 'online' | null
  const app = {
    screen: 'menu',
    mode: null,
    isHost: false,
    settings: { bots: 3, hook: false },
    form: { name: '', code: '' },
    menuError: '',
    showScoreboard: false,
    shownRound: 0,
    game: null, // a Game (solo/host) or a decoded snapshot (guest)
    online: null, // connection details, see openOnline()
  };

  // ------------------------------------------------------------------ rendering

  function render() {
    if (app.online && app.isHost) publishState();
    if (app.game && app.game.round !== app.shownRound) {
      app.shownRound = app.game.round;
      app.showScoreboard = false;
    }
    root.innerHTML = currentHtml();
  }

  function currentHtml() {
    if (app.screen === 'menu') return menuHtml(app);
    if (app.screen === 'lobby') return lobbyHtml(lobbyModel());
    return gameHtml({
      view: app.game,
      mode: app.mode,
      isHost: app.isHost,
      code: app.online ? app.online.code : null,
      showScoreboard: app.showScoreboard,
      width: getViewportWidth(),
    });
  }

  // ------------------------------------------------------------------ solo play

  function startSolo() {
    leaveEverything();
    app.mode = 'solo';
    const lineup = createLineup([{ name: 'You', token }], app.settings.bots);
    beginGame(lineup);
  }

  function beginGame(lineup) {
    app.game = new Game({ players: lineup, hook: app.settings.hook, viewerToken: token, onChange: render, timing });
    app.screen = 'game';
    app.showScoreboard = false;
    app.game.start();
  }

  function destroyGame() {
    if (app.game instanceof Game) app.game.destroy();
    app.game = null;
  }

  function leaveEverything() {
    destroyGame();
    closeOnline();
  }

  function leave() {
    leaveEverything();
    app.screen = 'menu';
    app.mode = null;
    app.isHost = false;
    app.showScoreboard = false;
    render();
  }

  // ------------------------------------------------------------------ sending moves

  /** A move from the person at this screen. */
  function submit(action) {
    const game = app.game;
    if (!game) return;
    if (game instanceof Game) game.act(game.me, action);
    else if (app.online) app.online.session.sendAction(action);
  }

  // ------------------------------------------------------------------ online: shared

  function showMenuError(message) {
    app.menuError = message;
    render();
  }

  function openOnline(asHost, attempt = 0) {
    const name = sanitizeName(app.form.name);
    const code = asHost ? makeGameCode() : normalizeCode(app.form.code);
    if (code.length !== CODE_LENGTH) return showMenuError('Enter the 4-letter game code.');
    if (!PeerClass) return showMenuError('Could not load the connection library. Check your internet connection and reload the page.');

    leaveEverything();
    const online = { code, name, ready: false, error: null, rejected: null, sawHost: false, lost: false, lobby: null, absent: new Map(), sent: new Map(), timer: null, session: null };
    app.online = online;
    app.mode = 'online';
    app.isHost = asHost;
    app.screen = 'lobby';
    app.menuError = '';
    online.session = asHost ? createHostSession(online, attempt) : createGuestSession(online);
    render();
  }

  function closeOnline() {
    const online = app.online;
    if (!online) return;
    app.online = null; // handlers of the old session check this and go quiet
    clearInterval(online.timer);
    try { online.session.close(); } catch (error) { /* already closed */ }
  }

  function errorText(type, code) {
    if (type === 'peer-unavailable') return `No game found with code ${code}. Check the code, and make sure the host has created the game.`;
    if (type === 'timeout') return 'Could not reach the host. Check the code and your connection.';
    return 'Could not reach the matchmaking service. Check your internet connection.';
  }

  // ------------------------------------------------------------------ online: host

  function createHostSession(online, attempt) {
    const current = () => app.online === online;
    online.timer = setInterval(replaceAbsentPlayers, 3000);

    return new HostSession(PeerClass, online.code, {
      onOpen() {
        if (!current()) return;
        online.ready = true;
        render();
      },
      onError(type) {
        if (!current()) return;
        if (type === 'unavailable-id' && attempt < 5) return openOnline(true, attempt + 1); // code already taken: pick another
        online.error = errorText(type, online.code);
        render();
      },
      onJoin(joinToken) {
        if (!current() || joinToken === token) return { accepted: false, reason: 'invalid' };
        if (app.game) return app.game.seatOfHuman(joinToken) >= 0 ? { accepted: true } : { accepted: false, reason: 'started' };
        const full = !online.session.has(joinToken) && online.session.players().length >= MAX_PLAYERS - 1;
        return full ? { accepted: false, reason: 'full' } : { accepted: true };
      },
      onJoined(joinToken) {
        if (!current()) return;
        online.absent.delete(joinToken);
        online.sent.delete(joinToken); // make sure they get a fresh state
        render();
      },
      onAction(joinToken, action) {
        if (!current() || !(app.game instanceof Game)) return;
        const seat = app.game.seatOfHuman(joinToken);
        if (seat >= 0) app.game.act(seat, action);
      },
      onLeave(joinToken) {
        if (!current()) return;
        if (app.game && app.game.seatOfHuman(joinToken) >= 0) online.absent.set(joinToken, Date.now());
        render();
      },
    });
  }

  /** Everyone in the lobby, host first: [{ token, name }]. */
  function lobbyPlayers() {
    const online = app.online;
    return [{ token, name: online.name }, ...online.session.players()].slice(0, MAX_PLAYERS);
  }

  /** Send each guest their personal view, but only when it changed. */
  function publishState() {
    const online = app.online;
    const names = app.game ? null : lobbyPlayers().map((p) => p.name);
    for (const { token: guestToken } of online.session.players()) {
      let state;
      if (app.game) {
        const seat = app.game.seatOfHuman(guestToken);
        if (seat < 0) continue;
        state = snapshotGame(app.game, seat);
      } else {
        state = snapshotLobby(names, lobbyPlayers().findIndex((p) => p.token === guestToken), app.settings.hook);
      }
      const json = JSON.stringify(state);
      if (online.sent.get(guestToken) === json) continue;
      online.sent.set(guestToken, json);
      online.session.sendTo(guestToken, { type: 'state', state });
    }
  }

  function replaceAbsentPlayers() {
    const online = app.online;
    if (!online || !(app.game instanceof Game)) return;
    for (const [absentToken, since] of [...online.absent]) {
      if (Date.now() - since < ABSENT_TAKEOVER_MS) continue;
      online.absent.delete(absentToken);
      const seat = app.game.seatOfHuman(absentToken);
      if (seat >= 0) app.game.takeOver(seat);
    }
  }

  function startOnlineGame() {
    if (!app.online || !app.isHost || app.game) return;
    const humans = lobbyPlayers();
    const bots = Math.max(0, MIN_PLAYERS - humans.length);
    beginGame(createLineup(humans, bots, { shuffleSeats: true }));
  }

  function backToLobby() {
    if (!app.online || !app.isHost) return;
    destroyGame();
    app.screen = 'lobby';
    app.online.sent.clear();
    render();
  }

  // ------------------------------------------------------------------ online: guest

  function createGuestSession(online) {
    const current = () => app.online === online;

    return new ClientSession(PeerClass, online.code, { token, name: online.name }, {
      onState(state) {
        if (!current()) return;
        try {
          if (state.phase === 'lobby') {
            app.game = null;
            app.screen = 'lobby';
            online.lobby = { players: state.players.map((name) => sanitizeName(name)), me: state.me, hook: !!state.hook };
          } else {
            app.game = viewFromSnapshot(state);
            app.screen = 'game';
          }
        } catch (error) {
          return; // ignore malformed data
        }
        online.sawHost = true;
        online.lost = false;
        online.rejected = null;
        render();
      },
      onRejected(reason) {
        if (!current()) return;
        online.rejected = reason;
        render();
      },
      onClosed() {
        if (!current()) return;
        if (online.sawHost) online.lost = true;
        else online.error = errorText('timeout', online.code);
        app.game = null;
        app.screen = 'lobby';
        render();
      },
      onError(type) {
        if (!current()) return;
        if (type === 'timeout' && online.sawHost) return;
        online.error = errorText(type, online.code);
        render();
      },
    });
  }

  // ------------------------------------------------------------------ lobby view model

  function lobbyStatus(online) {
    if (online.error) return { kind: 'error', text: online.error };
    if (online.lost) return { kind: 'error', text: 'The host has left, so the game has ended.' };
    if (online.rejected) return { kind: 'error', text: REJECTION_TEXT[online.rejected] || 'You could not join this game.' };
    const connected = app.isHost ? online.ready : online.sawHost;
    return connected ? { kind: 'ready' } : { kind: 'connecting', text: 'Connecting…' };
  }

  function lobbyModel() {
    const online = app.online;
    let players = [];
    let me = -1;
    let hook = false;
    if (app.isHost) {
      players = lobbyPlayers().map((p) => p.name);
      me = 0;
      hook = app.settings.hook;
    } else if (online.lobby) {
      ({ players, me, hook } = online.lobby);
    }
    return {
      code: online.code,
      isHost: app.isHost,
      players,
      me,
      hook,
      botCount: Math.max(0, MIN_PLAYERS - players.length),
      status: lobbyStatus(online),
    };
  }

  // ------------------------------------------------------------------ user actions

  const actions = {
    'set-bots': ({ value }) => { app.settings.bots = clamp(Number(value), 2, 5); render(); },
    'toggle-hook': (_data, element) => {
      if (app.mode === 'online' && !app.isHost) return; // only the host decides
      app.settings.hook = element.checked;
      render();
    },
    'start-solo': startSolo,
    'play-again': startSolo,
    'create-game': () => openOnline(true),
    'join-game': () => openOnline(false),
    'start-online': startOnlineGame,
    'back-to-lobby': backToLobby,
    leave,
    bid: ({ value }) => submit({ type: ACTION.BID, value: Number(value) }),
    trump: ({ value }) => submit({ type: ACTION.TRUMP, value }),
    play: ({ value }) => submit({ type: ACTION.PLAY, value: Number(value) }),
    next: () => submit({ type: ACTION.NEXT }),
    'show-scoreboard': () => { app.showScoreboard = true; render(); },
    'hide-scoreboard': () => { app.showScoreboard = false; render(); },
  };

  function dispatch(name, data = {}, element = null) {
    const handler = actions[name];
    if (handler) handler(data, element);
  }

  root.addEventListener('click', (event) => {
    const element = event.target.closest ? event.target.closest('[data-action]') : null;
    if (element && !element.disabled) dispatch(element.dataset.action, element.dataset, element);
  });
  // Text fields only store their value; redrawing while typing would steal the focus.
  root.addEventListener('input', (event) => {
    const field = event.target.dataset && event.target.dataset.field;
    if (field) app.form[field] = event.target.value;
  });

  render();
  return { app, dispatch, render };
}
