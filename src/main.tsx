import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { TelegramProvider } from './telegram/TelegramProvider';
import { getWebApp, launchedByTelegram, loadTelegramScript } from './telegram/webapp';

// The official telegram-web-app.js is loaded only when Telegram actually launched us,
// so the public browser demo makes zero third-party requests.
async function start() {
  if (launchedByTelegram() && !window.Telegram?.WebApp) await loadTelegramScript();
  if (getWebApp()) document.documentElement.classList.add('tg');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <TelegramProvider>
        <App />
      </TelegramProvider>
    </StrictMode>,
  );
}
void start();
