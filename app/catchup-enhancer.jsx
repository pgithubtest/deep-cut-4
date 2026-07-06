'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'deep-cut-active-session-v1';
const LIBRARY_KEY = 'deep-cut-sessions-v1';
const MAX_SESSIONS = 8;

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

function formatSessionMeta(session) {
  const artist = String(session?.artist || '').trim();
  let meta = String(session?.status || session?.resumePhase || 'Saved session').trim();

  if (artist) {
    const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    meta = meta.replace(new RegExp(`^${escapedArtist}\\s*·\\s*`, 'i'), '');
  }

  meta = meta
    .replace(/\s*·\s*Mode:\s*(deep|commute|reentry)\b/gi, '')
    .replace(/\s*·\s*(Deep listen|On the move)\b/gi, '')
    .replace(/\s*·\s*Next:\s*/gi, ' · ')
    .replace(/\bMode:\s*(deep|commute|reentry)\b/gi, '')
    .replace(/\bDeep listen\b/gi, '')
    .replace(/\bNext:\s*/gi, '')
    .replace(/\s*·\s*$/g, '')
    .trim();

  if (!meta || meta === 'confirming') meta = 'Discography ready';
  if (meta === 'artist_orientation') meta = 'Artist orientation ready';
  if (meta === 'album_intro') meta = 'Album intro ready';
  if (meta === 'cold') meta = session?.track ? `Track ${session.track.num} · ${session.track.title}` : 'Ready for next track';
  if (meta === 'breakdown') meta = session?.track ? `Track ${session.track.num} · ${session.track.title}` : 'Breakdown ready';
  if (meta === 'album_wrap') meta = 'Album wrap ready';

  return meta;
}

function sessionIdFor(session) {
  const base = String(session?.artist || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'session';
  return `${base}-${session?.createdAt || session?.savedAt || Date.now()}`;
}

function readLibrary() {
  const library = safeParse(window.localStorage.getItem(LIBRARY_KEY), { activeId: null, sessions: {} });
  return {
    activeId: library?.activeId || null,
    sessions: library?.sessions && typeof library.sessions === 'object' ? library.sessions : {}
  };
}

function writeLibrary(library) {
  const sessions = Object.values(library.sessions || {})
    .filter((session) => session?.artist)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    .slice(0, MAX_SESSIONS)
    .reduce((acc, session) => {
      acc[session.id] = session;
      return acc;
    }, {});
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify({ activeId: library.activeId, sessions }));
}

function saveSessionToLibrary(rawSession, makeActive = true) {
  if (!rawSession?.artist) return null;
  const library = readLibrary();
  const existing = Object.values(library.sessions).find((session) => session.id === rawSession.id || session.artist === rawSession.artist);
  const id = existing?.id || rawSession.id || sessionIdFor(rawSession);
  const session = {
    ...existing,
    ...rawSession,
    id,
    createdAt: existing?.createdAt || rawSession.createdAt || Date.now(),
    savedAt: rawSession.savedAt || Date.now()
  };
  library.sessions[id] = session;
  if (makeActive) library.activeId = id;
  writeLibrary(library);
  return session;
}

function archiveCurrentActiveSession() {
  const current = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (current?.artist) saveSessionToLibrary(current, true);
}

function installStorageBridge() {
  if (window.__deepCutStorageBridgeInstalled) return;
  window.__deepCutStorageBridgeInstalled = true;

  archiveCurrentActiveSession();

  const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  const originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

  window.localStorage.setItem = (key, value) => {
    if (key === STORAGE_KEY) {
      const session = safeParse(value);
      if (session?.artist) saveSessionToLibrary(session, true);
    }
    return originalSetItem(key, value);
  };

  window.localStorage.removeItem = (key) => {
    if (key === STORAGE_KEY) archiveCurrentActiveSession();
    return originalRemoveItem(key);
  };
}

function renderOverlay(text, resumeAction) {
  document.querySelector('.catchup-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'catchup-overlay';

  const card = document.createElement('div');
  card.className = 'catchup-card fade-in';

  const kicker = document.createElement('div');
  kicker.className = 'catchup-kicker';
  kicker.textContent = 'Catch up';

  const title = document.createElement('div');
  title.className = 'catchup-title';
  title.textContent = 'Where you left off';

  const body = document.createElement('div');
  body.className = 'catchup-body';
  cleanText(text).split(/\n\n+/).filter(Boolean).forEach((paragraph) => {
    const p = document.createElement('p');
    p.textContent = paragraph.trim();
    body.appendChild(p);
  });

  const actions = document.createElement('div');
  actions.className = 'catchup-actions';

  const continueButton = document.createElement('button');
  continueButton.className = 'bp';
  continueButton.textContent = 'Continue listening';
  continueButton.addEventListener('click', () => {
    overlay.remove();
    resumeAction?.();
  });

  const closeButton = document.createElement('button');
  closeButton.className = 'bg';
  closeButton.textContent = 'Stay on Home';
  closeButton.addEventListener('click', () => overlay.remove());

  actions.appendChild(continueButton);
  actions.appendChild(closeButton);
  card.appendChild(kicker);
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function activateSession(session) {
  if (!session?.artist) return;
  saveSessionToLibrary(session, true);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.location.reload();
}

async function catchUpSession(session, resumeAction, button) {
  if (!session?.artist) return;
  const originalText = button.textContent;
  button.textContent = 'Catching up...';
  button.disabled = true;

  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'catchUp',
        messages: session.messages || [],
        mode: session.mode || 'deep',
        phase: session.resumePhase || 'confirming',
        status: session.status || '',
        track: session.track || null
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Catch-up failed.');
    renderOverlay(data.text, resumeAction);
  } catch (error) {
    alert(error.message || 'Catch-up failed.');
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

function buildSessionRow(session, { resumeAction, catchUpAction, active = false } = {}) {
  const row = document.createElement('div');
  row.className = active ? 'session-row active-session-row' : 'session-row';

  const info = document.createElement('div');
  info.className = 'session-info';

  const title = document.createElement('div');
  title.className = 'session-title';
  title.textContent = session.artist;

  const meta = document.createElement('div');
  meta.className = 'session-meta';
  meta.textContent = formatSessionMeta(session);

  info.appendChild(title);
  info.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'session-actions';

  const resume = document.createElement('button');
  resume.className = 'bg session-resume';
  resume.textContent = 'Resume';
  resume.addEventListener('click', resumeAction);

  const catchup = document.createElement('button');
  catchup.className = 'bg session-catchup';
  catchup.textContent = 'Catch up';
  catchup.addEventListener('click', () => catchUpAction(catchup));

  actions.appendChild(resume);
  actions.appendChild(catchup);
  row.appendChild(info);
  row.appendChild(actions);
  return row;
}

function renderActiveSessionRow() {
  const resumeCard = document.querySelector('.resume-card');
  const resumeButton = resumeCard?.querySelector('.resume-btn');
  const current = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (!resumeCard || !resumeButton || !current?.artist) return;

  resumeCard.classList.add('resume-card-hidden');

  const existing = document.querySelector('.active-session-shell');
  if (existing) return;

  const shell = document.createElement('div');
  shell.className = 'active-session-shell';

  const label = document.createElement('div');
  label.className = 'session-library-label active-session-label';
  label.textContent = 'Continue listening';

  const row = buildSessionRow(current, {
    active: true,
    resumeAction: () => resumeButton.click(),
    catchUpAction: (button) => catchUpSession(current, () => resumeButton.click(), button)
  });

  shell.appendChild(label);
  shell.appendChild(row);
  resumeCard.insertAdjacentElement('beforebegin', shell);
}

function renderSessionLibrary() {
  const landing = document.querySelector('.input-wrap');
  if (!landing || landing.querySelector('.session-library')) return;

  const current = safeParse(window.localStorage.getItem(STORAGE_KEY));
  archiveCurrentActiveSession();
  const library = readLibrary();
  const sessions = Object.values(library.sessions || {})
    .filter((session) => session?.artist && session.artist !== current?.artist)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    .slice(0, 4);

  if (!sessions.length) return;

  const section = document.createElement('div');
  section.className = 'session-library';

  sessions.forEach((session) => {
    const row = buildSessionRow(session, {
      resumeAction: () => activateSession(session),
      catchUpAction: (button) => catchUpSession(session, () => activateSession(session), button)
    });
    section.appendChild(row);
  });

  const divider = landing.querySelector('.resume-divider');
  if (divider) {
    divider.insertAdjacentElement('beforebegin', section);
  } else {
    landing.insertAdjacentElement('afterbegin', section);
  }
}

function spotifySearchUrl(artist, title) {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`.trim())}`;
}

function renderSpotifyButton() {
  const cold = document.querySelector('.cold');
  if (!cold) return;

  const title = cold.querySelector('.tname')?.textContent?.trim();
  const session = safeParse(window.localStorage.getItem(STORAGE_KEY));
  const artist = session?.artist || document.querySelector('.artist-lbl')?.textContent?.trim() || '';
  if (!artist || !title) return;

  let link = cold.querySelector('.spotify-link');
  if (!link) {
    link = document.createElement('a');
    link.className = 'spotify-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in Spotify';
    cold.querySelector('.cinstr')?.insertAdjacentElement('afterend', link);
  }

  link.href = spotifySearchUrl(artist, title);
  link.setAttribute('aria-label', `Open ${title} by ${artist} in Spotify`);
}

export default function CatchUpEnhancer() {
  useEffect(() => {
    installStorageBridge();
    renderActiveSessionRow();
    renderSessionLibrary();
    renderSpotifyButton();
    const observer = new MutationObserver(() => {
      renderActiveSessionRow();
      renderSessionLibrary();
      renderSpotifyButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
