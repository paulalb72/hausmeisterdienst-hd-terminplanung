/* Erzeugt die PWA-Icons aus der echten Bildmarke.
 *
 * Die Bildmarke ist eine SVG mit Farbverläufen – die lässt sich nicht
 * sinnvoll von Hand rastern. Das Skript rendert sie deshalb in einem
 * Chromium und fotografiert das Ergebnis. Das ist eine seltene Aufgabe
 * (nur wenn sich das Logo ändert), darum ist Playwright bewusst KEINE
 * Abhängigkeit des Projekts – die erzeugten PNG liegen fertig im Repo.
 *
 * Aufruf:
 *   cd web
 *   npx --yes playwright@1.49.0 install chromium     # einmalig
 *   npx --yes -p playwright@1.49.0 node tools/make-icons.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright fehlt. Siehe Kommentar oben im Skript.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const bildmarke = readFileSync(join(here, '..', 'src', 'assets', 'logo', 'bildmarke.svg'), 'utf8');

// Verlauf der Bildmarke, damit Icon und Logo zusammenpassen.
const VERLAUF = 'linear-gradient(160deg, #2D9537 0%, #1B6C30 100%)';

/**
 * @param size      Kantenlänge in Pixeln
 * @param anteil    Wie viel der Fläche das Motiv einnimmt (Rest ist Rand).
 *                  Maskable Icons brauchen mehr Rand, weil Android rund
 *                  beschneidet.
 * @param durchsichtig  Für die Badge: weißes Motiv ohne Hintergrund.
 */
async function icon(browser, { datei, size, anteil = 0.66, durchsichtig = false }) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!DOCTYPE html><html><body style="
      margin:0;width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      background:${durchsichtig ? 'transparent' : VERLAUF};">
    <div style="width:${Math.round(size * anteil)}px;${durchsichtig || true ? 'filter:brightness(0) invert(1);' : ''}">
      ${bildmarke}
    </div>
  </body></html>`);
  const buf = await page.screenshot({ omitBackground: durchsichtig });
  writeFileSync(join(OUT, datei), buf);
  await page.close();
  console.log(`${datei}  (${size}x${size})`);
}

const browser = await chromium.launch();
await icon(browser, { datei: 'icon-192.png', size: 192 });
await icon(browser, { datei: 'icon-512.png', size: 512 });
// Android schneidet maskable Icons rund zu – das Motiv muss weiter innen sitzen.
await icon(browser, { datei: 'icon-maskable-512.png', size: 512, anteil: 0.50 });
await icon(browser, { datei: 'apple-touch-icon.png', size: 180, anteil: 0.70 });
// Die Badge liegt monochrom auf dem Android-Statusbalken.
await icon(browser, { datei: 'badge-72.png', size: 72, anteil: 0.86, durchsichtig: true });
await browser.close();

// Favicon direkt als SVG – scharf in jeder Größe, winzig.
const inner = bildmarke
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '');
writeFileSync(join(OUT, '..', 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 347.57 206.95">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2D9537"/><stop offset="1" stop-color="#1B6C30"/>
  </linearGradient></defs>
  <rect x="-40" y="-70" width="430" height="350" fill="url(#bg)"/>
  <g style="filter:brightness(0) invert(1)">${inner}</g>
</svg>
`);
console.log('favicon.svg');
