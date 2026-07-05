import { NextResponse } from 'next/server';
import { askAI } from '../../../lib/ai';
import { SYSTEM_PROMPT, modeNote } from '../../../lib/systemPrompt';

export const runtime = 'nodejs';
export const maxDuration = 60;

function asConversationInput(messages = []) {
  return messages.map((message) => ({
    role: message.role,
    content: String(message.content || '')
  }));
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object was found in the AI response.');
  return JSON.parse(match[0]);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, artist, albums, messages = [], mode = 'deep', track } = body;

    if (action === 'buildDiscography') {
      if (!artist?.trim()) throw new Error('Artist is missing.');
      const prompt = `Search the web for the complete official discography of "${artist.trim()}". Find every album-length release: original studio albums, re-recordings, live albums, compilations, greatest hits, holiday or Christmas albums, soundtracks, anthologies, and any other official releases. Use search results only, not memory. Then return a JSON object listing every release you found. Set "included" to true ONLY for original studio albums of entirely new material. Set "included" to false for everything else with a short reason. Return ONLY valid JSON, no markdown:\n{"artist":"${artist.trim()}","albums":[{"title":"...","year":2000,"included":true,"reason":"Original studio album"}]}`;

      const text = await askAI({
        instructions: 'You are a careful music discography researcher. Return only valid JSON.',
        input: prompt,
        useWebSearch: true,
        maxOutputTokens: 3000
      });

      const parsed = extractJson(text);
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

    if (action === 'startAlbum') {
      const included = Array.isArray(albums) ? albums.filter((album) => album.included) : [];
      const first = included[0];
      if (!first) throw new Error('No included album found.');
      const prompt = `Start the companion. The confirmed album list is: ${JSON.stringify(included)}. Generate the PART 1 album scene-setting script for "${first.title}" (${first.year}). Write it as a warm, engaging 3-minute spoken script. End with: "Now listen to track 1: [TRACK TITLE]. Go in cold. When you're done, come back and I'll give you the breakdown."`;

      const text = await askAI({
        instructions: SYSTEM_PROMPT + modeNote(mode),
        input: [{ role: 'user', content: prompt }],
        useWebSearch: true,
        maxOutputTokens: 2600
      });

      return NextResponse.json({ text, messages: [{ role: 'user', content: prompt }, { role: 'assistant', content: text }] });
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
