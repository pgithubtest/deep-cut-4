'use client';

import { useEffect } from 'react';

const CACHE_KEY = 'deep-cut-artist-orientations-v1';

function safeParse(value, fallback = null) {
  try {
    return JSON.parse(value || 'null') || fallback;
  } catch {
    return fallback;
  }
}

function cleanText(text = '') {
  return String(text)
    .replace(/===STATUS===[\s\S]*?===/g, '')
    .replace(/^REPLAY:.*$/gim, '')
    .replace(/^NEXT:.*$/gim, '')
    .trim();
}

function cacheKeyFor(artist) {
  return String(artist || '').trim().toLowerCase();
}

function readCache() {
  return safeParse(window.localStorage.getItem(CACHE_KEY), {});
}

function writeCache(cache) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function getConfirmingScreen() {
  const title = document.querySelector('.h2');
  const artistHeading = document.querySelector('.eyebrow');
  if (!title || !artistHeading || title.textContent.trim() !== 'Start at the beginning.') return null;
  const screen = title.closest('.fade-in');
  if (!screen) return null;
  return { screen, artist: artistHeading.textContent.trim() };
}

function getBeginButton(screen) {
  return Array.from(screen.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Begin with the debut');
}

function renderParagraphs(container, text) {
  container.innerHTML = '';
  cleanText(text).split(/\n\n+/).filter(Boolean).slice(0, 3).forEach((paragraph) => {
    const p = document.createElement('p');
    p.textContent = paragraph.trim();
    container.appendChild(p);
  });
}

function buildOrientationScreen(artist) {
  const screen = document.createElement('div');
  screen.className = 'artist-orientation-screen fade-in';
  screen.dataset.artist = artist;

  const kicker = document.createElement('div');
  kicker.className = 'artist-orientation-kicker';
  kicker.textContent = 'Before the catalogue';

  const title = document.createElement('div');
  title.className = 'artist-orientation-title';
  title.textContent = `Why ${artist} matters`;

  const body = document.createElement('div');
  body.className = 'artist-orientation-body';
  const loading = document.createElement('p');
  loading.textContent = 'Finding the shape of the journey...';
  body.appendChild(loading);

  const actions = document.createElement('div');
  actions.className = 'actions actions-large artist-orientation-actions';

  const begin = document.createElement('button');
  begin.className = 'bp artist-orientation-begin';
  begin.textContent = 'Begin with the debut';

  const back = document.createElement('button');
  back.className = 'bg artist-orientation-back';
  back.textContent = 'Back to albums';

  actions.appendChild(begin);
  actions.appendChild(back);
  screen.appendChild(kicker);
  screen.appendChild(title);
  screen.appendChild(body);
  screen.appendChild(actions);
  return { screen, body, begin, back };
}

async function fetchOrientation(artist) {
  const prompt = `Write a short artist orientation for someone about to listen through ${artist}'s main studio albums chronologically. Do not write a biography. Do not preview every album. Do not spoil the whole journey. Give one central thesis about why this artist matters, one sense of the career arc, and one listening lens to carry into the first album. Warm spoken style. 120 to 180 words. No headings. No bullets.`;
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', prompt, messages: [], mode: 'deep' })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Artist orientation failed.');
  return cleanText(data.text || '');
}

async function populateOrientation(body, artist) {
  const key = cacheKeyFor(artist);
  const cache = readCache();
  if (cache[key]) {
    renderParagraphs(body, cache[key]);
    return;
  }
  try {
    const text = await fetchOrientation(artist);
    if (!text) throw new Error('Empty artist orientation.');
    writeCache({ ...cache, [key]: text });
    renderParagraphs(body, text);
  } catch {
    renderParagraphs(body, `This catalogue is best heard as an arc, not a playlist. Start by listening for what ${artist} keeps returning to: the emotional pressure, the formal habits, and the way each record changes the stakes. The first album is not just the beginning. It is the baseline that will make every later transformation easier to hear.`);
  }
}

function showOrientationGate({ screen, artist, beginButton }) {
  if (screen.querySelector('.artist-orientation-screen')) return;
  Array.from(screen.children).forEach((child) => child.classList.add('artist-orientation-hidden'));
  const built = buildOrientationScreen(artist);
  screen.prepend(built.screen);

  built.back.addEventListener('click', () => {
    built.screen.remove();
    Array.from(screen.children).forEach((child) => child.classList.remove('artist-orientation-hidden'));
  });

  built.begin.addEventListener('click', () => {
    beginButton.dataset.orientationBypass = 'true';
    beginButton.click();
  });

  populateOrientation(built.body, artist);
}

function installArtistOrientationGate() {
  const confirming = getConfirmingScreen();
  if (!confirming?.artist) return;
  document.querySelector('.artist-orientation-card')?.remove();
  const beginButton = getBeginButton(confirming.screen);
  if (!beginButton || beginButton.dataset.artistOrientationGate === 'true') return;

  beginButton.dataset.artistOrientationGate = 'true';
  beginButton.addEventListener('click', (event) => {
    if (beginButton.dataset.orientationBypass === 'true') {
      beginButton.dataset.orientationBypass = 'false';
      return;
    }
    if (beginButton.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    showOrientationGate({ screen: confirming.screen, artist: confirming.artist, beginButton });
  }, true);
}

export default function ArtistOrientationEnhancer() {
  useEffect(() => {
    installArtistOrientationGate();
    const observer = new MutationObserver(() => installArtistOrientationGate());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
