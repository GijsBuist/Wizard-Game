// Peer-to-peer transport on top of PeerJS. It only moves messages: it knows nothing about the game.
//
// client -> host:  { type: 'hello', token, name }   { type: 'action', action }
// host -> client:  { type: 'state', state }         { type: 'rejected', reason }
import { CODE_LENGTH, CONNECT_TIMEOUT_MS } from './constants.js';
import { sanitizeName } from './util.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no letter I or O

export function makeGameCode(random = Math.random) {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join('');
}

export const normalizeCode = (text) => String(text).toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH);

const peerIdFor = (code) => 'wzd-' + code.toLowerCase();

/**
 * The host side. Handlers:
 *   onOpen()                         connected to the matchmaking service, code is usable
 *   onError(type)
 *   onJoin(token, name)              -> { accepted: true } | { accepted: false, reason }
 *   onJoined(token)                  after an accepted join
 *   onAction(token, action)
 *   onLeave(token)
 */
export class HostSession {
  constructor(PeerClass, code, handlers) {
    this.handlers = handlers;
    this.connections = new Map(); // token -> connection
    this.peer = new PeerClass(peerIdFor(code));
    this.peer.on('open', () => handlers.onOpen());
    this.peer.on('error', (error) => handlers.onError(error.type));
    this.peer.on('connection', (connection) => this.#accept(connection));
  }

  /** Everyone currently connected: [{ token, name }] in the order they joined. */
  players() {
    return [...this.connections].map(([token, connection]) => ({ token, name: connection.playerName }));
  }

  has(token) {
    return this.connections.has(token);
  }

  sendTo(token, message) {
    const connection = this.connections.get(token);
    if (connection && connection.open) connection.send(message);
  }

  close() {
    this.peer.destroy();
  }

  #accept(connection) {
    connection.on('data', (message) => this.#onMessage(connection, message));
    connection.on('close', () => this.#onClose(connection));
    connection.on('error', () => {});
  }

  #onMessage(connection, message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'hello') this.#onHello(connection, message);
    else if (message.type === 'action' && connection.token) this.handlers.onAction(connection.token, message.action);
  }

  #onHello(connection, { token, name }) {
    if (typeof token !== 'string' || token.length === 0 || token.length > 20) return;
    const playerName = sanitizeName(name);
    const verdict = this.handlers.onJoin(token, playerName);
    if (!verdict.accepted) {
      connection.send({ type: 'rejected', reason: verdict.reason });
      setTimeout(() => connection.close(), 500);
      return;
    }
    connection.token = token;
    connection.playerName = playerName;
    const previous = this.connections.get(token); // same person reconnecting
    this.connections.set(token, connection);
    if (previous && previous !== connection) previous.close();
    this.handlers.onJoined(token);
  }

  #onClose(connection) {
    // Ignore the close of a connection that was already replaced by a newer one.
    if (!connection.token || this.connections.get(connection.token) !== connection) return;
    this.connections.delete(connection.token);
    this.handlers.onLeave(connection.token);
  }
}

/**
 * The client side. Handlers:
 *   onState(state)   onRejected(reason)   onClosed()   onError(type)
 * `onError('timeout')` is reported when the host never answers.
 */
export class ClientSession {
  constructor(PeerClass, code, { token, name }, handlers) {
    this.handlers = handlers;
    this.connection = null;
    this.gotState = false;
    this.peer = new PeerClass();
    this.timeout = setTimeout(() => {
      if (!this.gotState) handlers.onError('timeout');
    }, CONNECT_TIMEOUT_MS);

    this.peer.on('error', (error) => handlers.onError(error.type));
    this.peer.on('open', () => {
      const connection = this.peer.connect(peerIdFor(code), { reliable: true });
      this.connection = connection;
      connection.on('open', () => connection.send({ type: 'hello', token, name }));
      connection.on('data', (message) => this.#onMessage(message));
      connection.on('close', () => handlers.onClosed());
    });
  }

  sendAction(action) {
    if (this.connection && this.connection.open) this.connection.send({ type: 'action', action });
  }

  close() {
    clearTimeout(this.timeout);
    this.peer.destroy();
  }

  #onMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'state') {
      this.gotState = true;
      this.handlers.onState(message.state);
    } else if (message.type === 'rejected') {
      this.gotState = true;
      this.handlers.onRejected(message.reason);
    }
  }
}
