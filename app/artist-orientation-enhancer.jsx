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

function currentConfirmingArtist() {
  const heading = document.querySelector('.eyebrow');
  const title = document.querySelector('.h2');
  if (!heading || title?.textContent?.trim() !== 'Start at the beginning.') return '';
  return heading.textContent.trim();
}

function renderParagraphs(container, text) {
  container.innerHTML = '';
  cleanText(text).split(/\n\n+/).filter(Boolean).slice(0, 3).forEach((paragraph) => {
    const p = document.createElement('p');
    p.textContent = paragraph.trim();
    container.appendChild(p);
  });
}

function buildCard(artist) {
  const card = document.createElement('div');
  card.className = 'artist-orientation-card fade-in';
  card.dataset.artist = artist;

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

  card.appendChild(kicker);
  card.appendChild(title);
  card.appendChild(body);
  return { card, body };
}

async function fetchOrientation(artist) {
  const prompt = `Write a short artist orientation for someone about to listen through ${artist}'s main studio albums chronologically. Do not write a biography. Do not preview every album. Do not spoil the whole journey. Give one central thesis about why this artist matters, one sense of the career arc, and one listening lens to carry into the first album. Warm spoken style. 120 to 180 words. No headings. No bullets.`;
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'generate',
      prompt,
      messages: [],
      mode: 'deep'
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Artist orientation failed.');
  return cleanText(data.text || '');
}

async function installArtistOrientation() {
  const artist = currentConfirmingArtist();
  if (!artist) return;

  const title = document.querySelector('.h2');
  const existing = document.querySelector('.artist-orientation-card');
  if (existing?.dataset.artist === artist) return;
  existing?.remove();

  const { card, body } = buildCard(artist);
  title.insertAdjacentElement('beforebegin', card);

  const key = cacheKeyFor(artist);
  const cache = readCache();
  if (cache[key]) {
    renderParagraphs(body, cache[key]);
    return;
  }

  try {
    const text = await fetchOrientation(artist);
    if (!text) throw new Error('Empty artist orientation.');
    const nextCache = { ...cache, [key]: text };
    writeCache(nextCache);
    renderParagraphs(body, text);
  } catch {
    renderParagraphs(body, `This catalogue is best heard as an arc, not a playlist. Start by listening for what ${artist} keeps returning to: the emotional pressure, the formal habits, and the way each record changes the stakes. The first album is not just the beginning. It is the baseline that will make every later transformation easier to hear.`);
  }
}

export default function ArtistOrientationEnhancer() {
  useEffect(() => {
    installArtistOrientation();
    const observer = new MutationObserver(() => installArtistOrientation());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
