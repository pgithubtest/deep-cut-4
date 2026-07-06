'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'deep-cut-active-session-v1';
const LIBRARY_KEY = 'deep-cut-sessions-v1';
const PENDING_RESUME_KEY = 'deep-cut-pending-resume-v1';
const CURRENT_ALBUM_KEY = 'deep-cut-current-album-v1';
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

function normaliseMode(mode) {
  if (mode === 'commute') return 'On the move';
  return 'Deep listen';
}

function modeForStatus(mode) {
  if (mode === 'commute') return 'On the move';
  return 'Deep Listen';
}

function formatSessionMeta(session) {
  const artist = String(session?.artist || '').trim();
  const modeLabel = normaliseMode(session?.mode);
  let meta = String(session?.status || session?.resumePhase || 'Saved session').trim();

  if (artist) {
    meta = meta.replace(new RegExp(`^${artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*·\\s*`, 'i'), '');
  }

  meta = meta
    .replace(/\s*·\s*Mode:\s*(deep|commute|reentry)\b/gi, '')
    .replace(/\s*·\s*(Deep listen|On the move)\b/gi, '')
    .replace(/\bMode:\s*(deep|commute|reentry)\b/gi, '')
    .replace(/\s*·\s*$/g, '')
    .trim();

  if (!meta || meta === 'confirming') meta = 'Discography ready';
  if (meta === 'artist_orientation') meta = 'Artist orientation ready';
  if (meta === 'album_intro') meta = 'Album intro ready';
  if (meta === 'cold') meta = session?.track ? `Track ${session.track.num} · ${session.track.title}` : 'Ready for next track';
  if (meta === 'breakdown') meta = session?.track ? `Track ${session.track.num} · ${session.track.title}` : 'Breakdown ready';
  if (meta === 'album_wrap') meta = 'Album wrap ready';

  return `${meta} · ${modeLabel}`;
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

function syncActiveSessionToLibrary() {
  const current = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (current?.artist) saveSessionToLibrary(current, true);
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
  const savedSession = saveSessionToLibrary(session, true) || session;
  window.localStorage.setItem(PENDING_RESUME_KEY, JSON.stringify({ id: savedSession.id, artist: savedSession.artist, savedAt: Date.now() }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSession));
  window.location.reload();
}

function autoResumePendingSession() {
  const pending = safeParse(window.localStorage.getItem(PENDING_RESUME_KEY));
  if (!pending?.artist) return;

  const current = safeParse(window.localStorage.getItem(STORAGE_KEY));
  const sameSession = current?.id === pending.id || current?.artist === pending.artist;
  const resumeButton = document.querySelector('.resume-card .resume-btn');
  if (!sameSession || !resumeButton) return;

  window.localStorage.removeItem(PENDING_RESUME_KEY);
  resumeButton.click();
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
  syncActiveSessionToLibrary();
  const library = readLibrary();
  const sessions = Object.values(library.sessions || {})
    .filter((session) => session?.artist && session.artist !== current?.artist)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    .slice(0, 4);

  if (!sessions.length) return;

  const section = document.createElement('div');
  section.className = 'session-library';

  const label = document.createElement('div');
  label.className = 'session-library-label';
  label.textContent = 'Saved sessions';
  section.appendChild(label);

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

function includedAlbums(session) {
  return Array.isArray(session?.albums) ? session.albums.filter((album) => album?.included && album?.title) : [];
}

function currentAlbumStoreKey(session) {
  return `${CURRENT_ALBUM_KEY}-${session?.id || sessionIdFor(session || {})}`;
}

function rememberCurrentAlbum(session, title) {
  if (!session?.artist || !title) return;
  window.sessionStorage.setItem(currentAlbumStoreKey(session), title);
}

function rememberedCurrentAlbum(session) {
  if (!session?.artist) return '';
  return window.sessionStorage.getItem(currentAlbumStoreKey(session)) || '';
}

function inferCurrentAlbum(session) {
  const searchable = `${session?.content || ''}\n${session?.status || ''}`.toLowerCase();
  const match = includedAlbums(session).find((album) => searchable.includes(String(album.title).toLowerCase()));
  if (match?.title) {
    rememberCurrentAlbum(session, match.title);
    return match.title;
  }
  return rememberedCurrentAlbum(session) || String(session?.status || '').split(' · ')[0] || session?.artist || '';
}

function correctStatusBar() {
  const statusText = document.querySelector('.sbar .stxt');
  const current = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (!statusText || !current?.artist) return;

  const cold = document.querySelector('.cold');
  if (!cold) {
    inferCurrentAlbum(current);
    return;
  }

  const numText = cold.querySelector('.tnum')?.textContent || '';
  const title = cold.querySelector('.tname')?.textContent?.trim();
  const num = numText.match(/Track\s+(\d+)/i)?.[1] || current.track?.num;
  if (!num || !title) return;

  const total = Array.isArray(current.trackMap) && current.trackMap.length ? ` of ${current.trackMap.length}` : '';
  const albumTitle = inferCurrentAlbum(current);
  statusText.textContent = `${albumTitle} · Track ${num}${total} · Now: ${title} · Mode: ${modeForStatus(current.mode)}`;
}

export default function CatchUpEnhancer() {
  useEffect(() => {
    syncActiveSessionToLibrary();
    renderActiveSessionRow();
    renderSessionLibrary();
    autoResumePendingSession();
    correctStatusBar();

    const observer = new MutationObserver(() => {
      syncActiveSessionToLibrary();
      renderActiveSessionRow();
      renderSessionLibrary();
      autoResumePendingSession();
      correctStatusBar();
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
