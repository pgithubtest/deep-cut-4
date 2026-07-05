'use client';

import { useEffect, useRef, useState } from 'react';

const EXAMPLES = ['Radiohead', 'Joni Mitchell', 'Kendrick Lamar', 'The National', 'David Bowie', 'Fleetwood Mac', 'Frank Ocean', 'Nick Cave'];
const STORAGE_KEY = 'deep-cut-active-session-v1';
const RESUMABLE_PHASES = ['confirming', 'album_intro', 'cold', 'breakdown', 'album_wrap'];

const LOAD_MSGS = {
  disco: ['BUILDING THE DISCOGRAPHY', 'Mapping the releases...', 'Finding the catalogue...'],
  intro: ['Building the listening path...', 'Finding the first record...', 'Preparing the context...'],
  break: ['Reading the track...', 'Working through the songcraft...', 'Unpacking the song...'],
  wrap: ['Mapping the discography...', 'Preparing the album reflection...'],
  next: ['Finding the next track...', 'Moving forward...']
};

function pickMsg(key) {
  const arr = LOAD_MSGS[key] || ['Loading...'];
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseStatus(text) {
  const match = text.match(/===STATUS===\s*([\s\S]*?)\s*===/);
  return match ? match[1].trim() : '';
}

function parseReplay(text) {
  const match = text.match(/^REPLAY:\s*(Essential replay|Optional replay|Keep moving)/im);
  if (!match) return null;
  const replay = match[1].toLowerCase();
  if (replay.includes('essential')) return 'ess';
  if (replay.includes('optional')) return 'opt';
  return 'keep';
}

function parseReplayReason(text) {
  const match = text.match(/^REPLAY:.*?—\s*(.+)/im);
  return match ? match[1].trim() : '';
}

function parseNextLine(text) {
  const match = text.match(/^NEXT:\s*(.+)/im);
  return match ? match[1].trim() : '';
}

function parseColdListen(text) {
  const match = text.match(/track\s+(\d+):\s*['"“”‘’]?([^'"“”‘’\n.]+)['"“”‘’]?.*?go in cold/i);
  if (match) return { num: match[1], title: match[2].trim() };
  const fallback = text.match(/track\s+(\d+):\s*([^\.\n]+)/i);
  if (fallback) return { num: fallback[1], title: fallback[2].replace(/['"“”‘’]/g, '').trim() };
  return null;
}

function isLastTrack(nextLine) {
  return /last track|end of album|wrap.?up|album complete/i.test(nextLine || '');
}

function cleanForDisplay(text) {
  return text
    .replace(/===STATUS===[\s\S]*?===/g, '')
    .replace(/^REPLAY:.*$/gim, '')
    .replace(/^NEXT:.*$/gim, '')
    .trim();
}

function renderParagraphs(text) {
  const clean = cleanForDisplay(text);
  return clean.split(/\n\n+/).filter(Boolean).map((paragraph, index) => {
    const html = paragraph
      .trim()
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
    return <p key={index} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

async function callBackend(payload) {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const rawText = await response.text();
  let data = null;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    const plainMessage = rawText?.trim()?.slice(0, 500) || 'The server returned an empty response.';
    throw new Error(`The backend did not return JSON. Server said: ${plainMessage}`);
  }

  if (!response.ok) throw new Error(data?.error || 'Request failed.');
  return data;
}

export default function App() {
  const [phase, setPhase] = useState('landing');
  const [resumePhase, setResumePhase] = useState(null);
  const [artistInput, setArtistInput] = useState('');
  const [artist, setArtist] = useState('');
  const [albums, setAlbums] = useState([]);
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState('');
  const [mode, setMode] = useState('deep');
  const [status, setStatus] = useState('');
  const [replay, setReplay] = useState(null);
  const [replayReason, setReplayReason] = useState('');
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [err, setErr] = useState('');
  const [showExcluded, setShowExcluded] = useState(false);
  const topRef = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved?.artist) return;
      setArtist(saved.artist || '');
      setAlbums(Array.isArray(saved.albums) ? saved.albums : []);
      setMessages(Array.isArray(saved.messages) ? saved.messages : []);
      setContent(saved.content || '');
      setMode(saved.mode || 'deep');
      setStatus(saved.status || '');
      setReplay(saved.replay || null);
      setReplayReason(saved.replayReason || '');
      setTrack(saved.track || null);
      setShowExcluded(Boolean(saved.showExcluded));
      setResumePhase(RESUMABLE_PHASES.includes(saved.resumePhase) ? saved.resumePhase : 'confirming');
      setPhase('landing');
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const phaseToSave = phase === 'landing' || phase === 'loading' ? resumePhase : phase;
    if (!artist || !RESUMABLE_PHASES.includes(phaseToSave)) return;
    if (!albums.length && !messages.length && !content) return;

    const snapshot = {
      artist,
      albums,
      messages,
      content,
      mode,
      status,
      replay,
      replayReason,
      track,
      showExcluded,
      resumePhase: phaseToSave,
      savedAt: Date.now()
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // If storage is full or unavailable, the in-memory session still works.
    }
  }, [phase, resumePhase, artist, albums, messages, content, mode, status, replay, replayReason, track, showExcluded]);

  useEffect(() => {
    if (topRef.current && ['album_intro', 'cold', 'breakdown', 'album_wrap'].includes(phase)) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [content, phase]);

  function updateGeneratedText(text) {
    const parsedStatus = parseStatus(text);
    if (parsedStatus) setStatus(parsedStatus);
    setContent(text);
  }

  function goHome() {
    if (RESUMABLE_PHASES.includes(phase)) setResumePhase(phase);
    setErr('');
    setPhase('landing');
  }

  function resumeListening() {
    if (RESUMABLE_PHASES.includes(resumePhase)) {
      setErr('');
      setPhase(resumePhase);
    }
  }

  function clearCurrentSessionForNewArtist() {
    setResumePhase(null);
    setAlbums([]);
    setMessages([]);
    setContent('');
    setStatus('');
    setReplay(null);
    setReplayReason('');
    setTrack(null);
    setShowExcluded(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  async function handleBuild() {
    if (!artistInput.trim()) return;
    setLoading(true);
    setErr('');
    setLoadMsg(pickMsg('disco'));
    setPhase('loading');
    clearCurrentSessionForNewArtist();
    const nextArtist = artistInput.trim();
    setArtist(nextArtist);
    try {
      const data = await callBackend({ action: 'buildDiscography', artist: nextArtist });
      setAlbums(data.parsed.albums || []);
      setMessages([{ role: 'user', content: `Build discography for ${nextArtist}` }, { role: 'assistant', content: data.text }]);
      setShowExcluded(false);
      setResumePhase('confirming');
      setPhase('confirming');
    } catch (error) {
      setErr(`Couldn't load the discography: ${error.message}`);
      setPhase('landing');
    } finally {
      setLoading(false);
    }
  }

  function toggleAlbum(index) {
    setAlbums((previous) => previous.map((album, albumIndex) => albumIndex === index ? { ...album, included: !album.included } : album));
  }

  async function handleConfirm() {
    setLoading(true);
    setErr('');
    setLoadMsg(pickMsg('intro'));
    setPhase('loading');
    try {
      const data = await callBackend({ action: 'startAlbum', albums, mode });
      setMessages(data.messages);
      updateGeneratedText(data.text);
      setResumePhase('album_intro');
      setPhase('album_intro');
    } catch (error) {
      setErr(`Failed to start: ${error.message}`);
      setPhase('confirming');
    } finally {
      setLoading(false);
    }
  }

  function goToCold() {
    const coldListen = parseColdListen(content);
    setTrack(coldListen || { num: '1', title: 'the first track' });
    setResumePhase('cold');
    setPhase('cold');
  }

  async function handleListened() {
    if (!track) return;
    setLoading(true);
    setErr('');
    setLoadMsg(pickMsg('break'));
    setPhase('loading');
    try {
      const data = await callBackend({ action: 'trackBreakdown', track, messages, mode });
      setMessages(data.messages);
      setReplay(parseReplay(data.text));
      setReplayReason(parseReplayReason(data.text));
      updateGeneratedText(data.text);
      setResumePhase('breakdown');
      setPhase('breakdown');
    } catch (error) {
      setErr(`Failed to load breakdown: ${error.message}`);
      setPhase('cold');
    } finally {
      setLoading(false);
    }
  }

  async function generateWithPrompt(prompt, nextPhase, loadingKey = 'next') {
    setLoading(true);
    setErr('');
    setLoadMsg(pickMsg(loadingKey));
    setPhase('loading');
    try {
      const data = await callBackend({ action: 'generate', prompt, messages, mode });
      setMessages(data.messages);
      updateGeneratedText(data.text);
      setResumePhase(nextPhase);
      setPhase(nextPhase);
      return data;
    } catch (error) {
      setErr(error.message);
      setPhase('breakdown');
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleNext() {
    const nextLine = parseNextLine(content);
    if (nextLine && isLastTrack(nextLine)) {
      await generateWithPrompt('Generate the PART 3 end-of-album reflection and wrap-up script. Include the discography map update.', 'album_wrap', 'wrap');
      return;
    }
    if (nextLine) {
      const coldListen = parseColdListen(nextLine);
      if (coldListen) {
        setTrack(coldListen);
        setResumePhase('cold');
        setPhase('cold');
        return;
      }
    }
    const data = await generateWithPrompt('The user is ready to move on. Is there another track? If yes, give ONLY the cold listen prompt with track number, title, and "go in cold". If this was the last track, say only: LAST_TRACK.', 'breakdown', 'next');
    if (!data) return;
    if (data.text.includes('LAST_TRACK') || isLastTrack(data.text)) {
      await generateWithPrompt('Generate the PART 3 end-of-album reflection and wrap-up script. Include the discography map update.', 'album_wrap', 'wrap');
      return;
    }
    const coldListen = parseColdListen(data.text);
    if (coldListen) {
      setTrack(coldListen);
      setResumePhase('cold');
      setPhase('cold');
    }
  }

  async function handleNextAlbum() {
    setReplay(null);
    setReplayReason('');
    await generateWithPrompt('The user is ready for the next album. Generate the PART 1 album scene-setting script for the next album in the confirmed discography. End with the cold listen prompt for track 1.', 'album_intro', 'intro');
  }

  const included = albums.filter((album) => album.included);
  const excluded = albums.filter((album) => !album.included);
  const inSession = ['album_intro', 'cold', 'breakdown', 'album_wrap'].includes(phase);
  const canResume = Boolean(artist && RESUMABLE_PHASES.includes(resumePhase) && (albums.length || messages.length || content));
  const resumeSummary = status || (track ? `Track ${track.num} · ${track.title}` : `${included.length} studio album${included.length !== 1 ? 's' : ''} ready`);

  return (
    <div className="app">
      <div className="grain" />
      <div className="grad">
        <div className="grad-a" />
        <div className="grad-b" />
        <div className="grad-c" />
      </div>

      <div className="wrap">
        <div className="logo">
          <div className="logo-t">Deep <em>Cut</em></div>
          <div className="logo-rule" />
          <div className="logo-sub">Listen through the catalogue in order</div>
        </div>

        {err && (
          <div className="err">
            <span>{err}</span>
            <button onClick={() => setErr('')} className="err-close">×</button>
          </div>
        )}

        {phase === 'landing' && (
          <div className="input-wrap fade-in">
            {canResume && (
              <div className="resume-card">
                <div className="resume-kicker">Saved session</div>
                <div className="resume-title">Resume {artist}</div>
                <div className="resume-meta">{resumeSummary}</div>
                <button className="bp resume-btn" onClick={resumeListening}>Resume listening</button>
              </div>
            )}
            {canResume && <div className="resume-divider">or start something new</div>}
            <input className="ai" value={artistInput} onChange={(event) => setArtistInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && !loading && handleBuild()} placeholder="Enter an artist" autoFocus />
            <button className="bp" onClick={handleBuild} disabled={!artistInput.trim() || loading}>{canResume ? 'Start a different discography' : 'Begin the discography'}</button>
            <div className="chips-lbl">Or start with one of these</div>
            <div className="chips">
              {EXAMPLES.map((example) => <button key={example} className="chip" onClick={() => setArtistInput(example)}>{example}</button>)}
            </div>
          </div>
        )}

        {phase === 'loading' && (
          <div className="loader fade-in">
            <div className="spin" />
            <div className="lmsg">{loadMsg}</div>
          </div>
        )}

        {phase === 'confirming' && (
          <div className="fade-in">
            <div className="eyebrow">{artist}</div>
            <div className="h2">Start at the beginning.</div>
            <p className="muted">{included.length} studio album{included.length !== 1 ? 's' : ''} included. Remove any you want to skip.</p>

            <div className="album-list">
              {included.map((album) => {
                const realIndex = albums.indexOf(album);
                return (
                  <div key={realIndex} className="arow">
                    <span className="ayr">{album.year}</span>
                    <div className="ainfo"><div className="aname">{album.title}</div></div>
                    <button className="toggle-btn remove" onClick={() => toggleAlbum(realIndex)}>Remove</button>
                  </div>
                );
              })}
            </div>

            <button className="excl-toggle" onClick={() => setShowExcluded((value) => !value)}>
              <span className="excl-toggle-left"><span>Not included</span>{excluded.length > 0 && <span className="excl-count">{excluded.length}</span>}</span>
              <span className={`excl-arrow${showExcluded ? ' open' : ''}`}>▾</span>
            </button>

            {showExcluded && (
              <div className="excl-body fade-in">
                {excluded.length === 0 ? <p className="empty-excluded">Nothing excluded yet.</p> : (
                  <div className="album-list excluded-list">
                    {excluded.map((album) => {
                      const realIndex = albums.indexOf(album);
                      return (
                        <div key={realIndex} className="arow excl">
                          <span className="ayr">{album.year}</span>
                          <div className="ainfo"><div className="aname">{album.title}</div>{album.reason && <div className="areason">{album.reason}</div>}</div>
                          <button className="toggle-btn" onClick={() => toggleAlbum(realIndex)}>Add in</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="actions actions-large">
              <button className="bp" onClick={handleConfirm} disabled={included.length === 0}>{included.length === 0 ? 'Add at least one album to continue' : 'Begin with the debut'}</button>
              <button className="bg" onClick={goHome}>Home</button>
            </div>
          </div>
        )}

        {inSession && (
          <div ref={topRef} className="mode-hdr">
            <button className="home-btn" onClick={goHome}>← Home</button>
            <span className="artist-lbl">{artist}</span>
            <div className="mode-btns">
              {[['deep', 'Deep listen'], ['commute', 'Commute'], ['reentry', 'Re-entry']].map(([key, label]) => (
                <button key={key} className={`mbtn${mode === key ? ' on' : ''}`} onClick={() => setMode(key)}>{label}</button>
              ))}
            </div>
          </div>
        )}

        {phase === 'album_intro' && (
          <div className="fade-in">
            <div className="eyebrow">Before you listen</div>
            <div className="content">{renderParagraphs(content)}</div>
            <div className="actions"><button className="bg" onClick={goHome}>Home</button><button className="bp" onClick={goToCold}>Begin with track 1</button></div>
          </div>
        )}

        {phase === 'cold' && track && (
          <div className="fade-in">
            <div className="cold"><div className="tnum">Track {track.num}</div><div className="tname">{track.title}</div><div className="cinstr">Open Spotify. Go in cold. Come back when you're done.</div><button className="bp cbtn" onClick={handleListened}>Show me the breakdown</button></div>
          </div>
        )}

        {phase === 'breakdown' && (
          <div className="fade-in">
            <div className="eyebrow">Track {track?.num} · {track?.title}</div>
            <div className="content">{renderParagraphs(content)}</div>
            {replay && <div className="replay-row"><span className={`rpill ${replay}`}>{replay === 'ess' ? '↺ Replay this' : replay === 'opt' ? '↺ Optional replay' : '→ Keep moving'}</span>{replayReason && <span className="replay-txt">{replayReason}</span>}</div>}
            <div className="actions"><button className="bp" onClick={handleNext}>Continue listening</button></div>
          </div>
        )}

        {phase === 'album_wrap' && (
          <div className="fade-in">
            <div className="eyebrow">After the album</div>
            <div className="content">{renderParagraphs(content)}</div>
            <div className="actions"><button className="bg" onClick={goHome}>Home</button><button className="bp" onClick={handleNextAlbum}>Next record</button></div>
          </div>
        )}
      </div>

      {status && inSession && <div className="sbar"><span className="sdot" /><span className="stxt">{status}</span></div>}
    </div>
  );
}
