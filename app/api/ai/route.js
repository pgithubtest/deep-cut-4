import { NextResponse } from 'next/server';
import { askAI } from '../../../lib/ai';
import { SYSTEM_PROMPT, modeNote } from '../../../lib/systemPrompt';

export const runtime = 'nodejs';
export const maxDuration = 60;

const KNOWN_DISCOGRAPHIES = {
  'taylor swift': {
    artist: 'Taylor Swift',
    albums: [
      { title: 'Taylor Swift', year: 2006, included: true, reason: 'Original studio album' },
      { title: 'Fearless', year: 2008, included: true, reason: 'Original studio album' },
      { title: 'Speak Now', year: 2010, included: true, reason: 'Original studio album' },
      { title: 'Red', year: 2012, included: true, reason: 'Original studio album' },
      { title: '1989', year: 2014, included: true, reason: 'Original studio album' },
      { title: 'Reputation', year: 2017, included: true, reason: 'Original studio album' },
      { title: 'Lover', year: 2019, included: true, reason: 'Original studio album' },
      { title: 'Folklore', year: 2020, included: true, reason: 'Original studio album' },
      { title: 'Evermore', year: 2020, included: true, reason: 'Original studio album' },
      { title: 'Midnights', year: 2022, included: true, reason: 'Original studio album' },
      { title: 'The Tortured Poets Department', year: 2024, included: true, reason: 'Original studio album' },
      { title: 'The Life of a Showgirl', year: 2025, included: true, reason: 'Original studio album' },
      { title: 'Fearless (Taylor\'s Version)', year: 2021, included: false, reason: 'Re-recording, not a new original studio album' },
      { title: 'Red (Taylor\'s Version)', year: 2021, included: false, reason: 'Re-recording, not a new original studio album' },
      { title: 'Speak Now (Taylor\'s Version)', year: 2023, included: false, reason: 'Re-recording, not a new original studio album' },
      { title: '1989 (Taylor\'s Version)', year: 2023, included: false, reason: 'Re-recording, not a new original studio album' }
    ]
  }
};

function asConversationInput(messages = []) {
  return messages.map((message) => ({
    role: message.role,
    content: String(message.content || '')
  }));
}

function sanitizeJsonText(text) {
  return text
    .replace(/```json|```/g, '')
    .replace(/[\u0000-\u001F\u200B-\u200F\uE000-\uF8FF]/g, '')
    .trim();
}

function tryExtractJson(text) {
  const cleaned = sanitizeJsonText(text);
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    const repaired = match[0].replace(/,\s*([\]}])/g, '$1');
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

function normalizeDiscography(parsed, fallbackArtist) {
  const albums = Array.isArray(parsed?.albums) ? parsed.albums : [];
  return {
    artist: parsed?.artist || fallbackArtist,
    albums: albums
      .filter((album) => album?.title)
      .map((album) => ({
        title: String(album.title),
        year: Number(album.year) || '',
        included: Boolean(album.included),
        reason: String(album.reason || (album.included ? 'Original studio album' : 'Excluded release'))
      }))
  };
}

function normalizeTrackMap(trackMap = []) {
  if (!Array.isArray(trackMap)) return [];
  return trackMap
    .filter((track) => track?.title && track?.num)
    .map((track) => ({
      num: String(track.num),
      title: String(track.title),
      essential: Boolean(track.essential),
      essentialReason: track.essential ? String(track.essentialReason || 'Important to the album or artist arc.') : ''
    }));
}

function parseConfirmedAlbums(messages = []) {
  const combined = messages.map((message) => String(message?.content || '')).join('\n');
  const match = combined.match(/confirmed album list is:\s*(\[[\s\S]*?\])\.\s*Generate/i);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.filter((album) => album?.title) : [];
  } catch {
    return [];
  }
}

function pickNextAlbum(messages = []) {
  const confirmedAlbums = parseConfirmedAlbums(messages);
  if (!confirmedAlbums.length) return null;

  const combined = messages.map((message) => String(message?.content || '')).join('\n').toLowerCase();
  let latestIndex = -1;

  confirmedAlbums.forEach((album, index) => {
    const title = String(album.title || '').toLowerCase();
    if (title && combined.includes(title)) latestIndex = Math.max(latestIndex, index);
  });

  return confirmedAlbums[latestIndex + 1] || null;
}

async function createAlbumIntroWithTrackMap({ prompt, mode, useWebSearch = true }) {
  const jsonPrompt = `${prompt}\n\nReturn ONLY valid JSON, no markdown, with this shape:\n{"intro":"full spoken album intro script ending with the cold-listen instruction","trackMap":[{"num":"1","title":"Track title","essential":true,"essentialReason":"One short reason, only if essential is true"}]}\n\nRules for trackMap: include the original standard tracklist in order. Set essential=true only for songs the user really should not casually skip because they are central to the album identity, artist arc, cultural reception, or later evolution. Most songs should be false. Keep essentialReason under 18 words.`;

  const raw = await askAI({
    instructions: SYSTEM_PROMPT + modeNote(mode) + '\n\nFor this request, return only valid JSON. Do not include markdown, citations, or commentary outside the JSON object.',
    input: [{ role: 'user', content: jsonPrompt }],
    useWebSearch,
    maxOutputTokens: 3800
  });

  const parsed = tryExtractJson(raw);
  if (!parsed?.intro) return { text: raw, trackMap: [] };
  return { text: String(parsed.intro), trackMap: normalizeTrackMap(parsed.trackMap) };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, artist, albums, messages = [], mode = 'deep', track, phase, status } = body;

    if (action === 'buildDiscography') {
      if (!artist?.trim()) throw new Error('Artist is missing.');
      const artistName = artist.trim();
      const known = KNOWN_DISCOGRAPHIES[artistName.toLowerCase()];
      if (known) {
        return NextResponse.json({ text: JSON.stringify(known), parsed: known });
      }

      const prompt = `Return a compact JSON object for the main discography of "${artistName}". Include original studio albums of new material in chronological order. Also include obvious major non-included album-length releases only if they are commonly confused with studio albums, such as re-recordings, live albums, compilations, Christmas albums, soundtracks, or anthologies. Set included true only for original studio albums of entirely new material. Return ONLY valid JSON, no markdown, no citations, no commentary. Shape: {"artist":"${artistName}","albums":[{"title":"...","year":2000,"included":true,"reason":"Original studio album"}]}`;

      const text = await askAI({
        instructions: 'You are a careful music discography organiser. Return only compact valid JSON. Do not browse. Do not include citation markers, footnotes, markdown, or commentary.',
        input: prompt,
        useWebSearch: false,
        maxOutputTokens: 1600
      });

      const parsed = normalizeDiscography(tryExtractJson(text), artistName);
      if (!parsed.albums.length) throw new Error('No valid album list was found in the AI response.');
      return NextResponse.json({ text, parsed });
    }

    if (action === 'generate') {
      const prompt = body.prompt;
      if (!prompt) throw new Error('Prompt is missing.');

      const input = [...asConversationInput(messages), { role: 'user', content: prompt }];
      const text = await askAI({
        instructions: SYSTEM_PROMPT + modeNote(mode),
        input,
        useWebSearch: false,
        maxOutputTokens: 2600
      });

      const newMessages = [...messages, { role: 'user', content: prompt }, { role: 'assistant', content: text }];
      return NextResponse.json({ text, messages: newMessages });
    }

    if (action === 'catchUp') {
      const prompt = `The user is returning to a saved listening session. Give a concise spoken catch-up before they continue. Current saved phase: ${phase || 'unknown'}. Current status: ${status || 'unknown'}. Current track: ${track ? `${track.num}: ${track.title}` : 'none'}. Summarise where they are in the artist journey and album arc, what they should remember, and what to do next. Keep it under 75 seconds. Do not give a full song breakdown. Do not change the listening mode. End with one clear next step.`;
      const input = [...asConversationInput(messages), { role: 'user', content: prompt }];
      const text = await askAI({
        instructions: SYSTEM_PROMPT + modeNote(mode) + '\n\nThis is a one-off catch-up only. Do not treat catch-up as a persistent mode.',
        input,
        useWebSearch: false,
        maxOutputTokens: 1200
      });
      return NextResponse.json({ text, messages: [...messages, { role: 'user', content: prompt }, { role: 'assistant', content: text }] });
    }

    if (action === 'startAlbum') {
      const included = Array.isArray(albums) ? albums.filter((album) => album.included) : [];
      const first = included[0];
      if (!first) throw new Error('No included album found.');
      const prompt = `Start the companion. The confirmed album list is: ${JSON.stringify(included)}. Generate the PART 1 album scene-setting script for "${first.title}" (${first.year}). Write it as a warm, engaging 3-minute spoken script. End with: "Now listen to track 1: [TRACK TITLE]. Go in cold. When you're done, come back and I'll give you the breakdown."`;

      const result = await createAlbumIntroWithTrackMap({ prompt, mode, useWebSearch: true });
      return NextResponse.json({ text: result.text, trackMap: result.trackMap, messages: [{ role: 'user', content: prompt }, { role: 'assistant', content: result.text }] });
    }

    if (action === 'nextAlbum') {
      const nextAlbum = pickNextAlbum(messages);
      const prompt = nextAlbum
        ? `The user is ready for the next album. Generate the PART 1 album scene-setting script for "${nextAlbum.title}" (${nextAlbum.year}). End with the cold listen prompt for track 1.`
        : 'The user is ready for the next album. Generate the PART 1 album scene-setting script for the next album in the confirmed discography. End with the cold listen prompt for track 1.';
      const jsonPrompt = `${prompt}\n\nReturn ONLY valid JSON, no markdown, with this shape:\n{"intro":"full spoken album intro script ending with the cold-listen instruction","trackMap":[{"num":"1","title":"Track title","essential":true,"essentialReason":"One short reason, only if essential is true"}]}\n\nRules for trackMap: include the original standard tracklist in order. Set essential=true only for songs the user really should not casually skip because they are central to the album identity, artist arc, cultural reception, or later evolution. Most songs should be false. Keep essentialReason under 18 words.`;

      const raw = await askAI({
        instructions: SYSTEM_PROMPT + modeNote(mode) + '\n\nFor this request, return only valid JSON. Do not include markdown, citations, or commentary outside the JSON object.',
        input: [...asConversationInput(messages), { role: 'user', content: jsonPrompt }],
        useWebSearch: true,
        maxOutputTokens: 3800
      });

      const parsed = tryExtractJson(raw);
      const text = parsed?.intro ? String(parsed.intro) : raw;
      const trackMap = normalizeTrackMap(parsed?.trackMap);
      const newMessages = [...messages, { role: 'user', content: prompt }, { role: 'assistant', content: text }];
      return NextResponse.json({ text, trackMap, messages: newMessages });
    }

    if (action === 'trackBreakdown') {
      if (!track) throw new Error('Track is missing.');
      const prompt = `The user has listened to track ${track.num}: "${track.title}". Give the full song breakdown now.`;
      const input = [...asConversationInput(messages), { role: 'user', content: prompt }];
      const text = await askAI({
        instructions: SYSTEM_PROMPT + modeNote(mode),
        input,
        useWebSearch: true,
        maxOutputTokens: 2600
      });
      return NextResponse.json({ text, messages: [...messages, { role: 'user', content: prompt }, { role: 'assistant', content: text }] });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Something went wrong.' }, { status: 500 });
  }
}
