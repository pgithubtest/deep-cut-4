'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'deep-cut-active-session-v1';

function cleanText(text = '') {
  return String(text)
    .replace(/===STATUS===[\s\S]*?===/g, '')
    .replace(/^REPLAY:.*$/gim, '')
    .replace(/^NEXT:.*$/gim, '')
    .trim();
}

function renderOverlay(text, resumeButton) {
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
    resumeButton?.click();
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

function addCatchUpButton() {
  const resumeCard = document.querySelector('.resume-card');
  const resumeButton = resumeCard?.querySelector('.resume-btn');
  if (!resumeCard || !resumeButton || resumeCard.querySelector('.catchup-btn')) return;

  const button = document.createElement('button');
  button.className = 'bg catchup-btn';
  button.textContent = 'Catch me up';

  button.addEventListener('click', async () => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved?.artist) return;

    const originalText = button.textContent;
    button.textContent = 'Catching up...';
    button.disabled = true;

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'catchUp',
          messages: saved.messages || [],
          mode: saved.mode || 'deep',
          phase: saved.resumePhase || 'confirming',
          status: saved.status || '',
          track: saved.track || null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Catch-up failed.');
      renderOverlay(data.text, resumeButton);
    } catch (error) {
      alert(error.message || 'Catch-up failed.');
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  });

  resumeButton.insertAdjacentElement('afterend', button);
}

export default function CatchUpEnhancer() {
  useEffect(() => {
    addCatchUpButton();
    const observer = new MutationObserver(addCatchUpButton);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
