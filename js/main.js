// Browser entry point.
import { createApp } from './app.js';

const root = document.getElementById('app');
const app = createApp({
  root,
  PeerClass: window.Peer, // loaded from a <script> tag in index.html
  storage: window.sessionStorage,
  getViewportWidth: () => window.innerWidth,
});
window.addEventListener('resize', () => app.render());
