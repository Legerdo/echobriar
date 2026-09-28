import './ui/style.css';
import { createGame } from './game';
import { installDebug } from './debug/debug';
import { bot } from './debug/bot';
import { L } from './locale/ko';

const game = createGame();
game.bot = bot;
installDebug();
game.boot().catch((err: unknown) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = L.loadFail;
});
