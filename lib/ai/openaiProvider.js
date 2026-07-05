const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function getOutputText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    if (item.type === 'message') {
      for (const content of item.content || []) {
        if (content.type === 'output_text' && content.text) parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

export async function createTextResponse({ instructions, input, useWebSearch = false, maxOutputTokens = 2200 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Add it in Vercel Environment Variables, or in .env.local for local testing.');
  }

  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-5.5',
    instructions,
    input,
    max_output_tokens: maxOutputTokens
  };

  if (useWebSearch) {
    body.tools = [{ type: 'web_search' }];
    body.tool_choice = 'required';
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }

  const text = getOutputText(data);
  if (!text) throw new Error('OpenAI returned no text. Try again, or check the model name in OPENAI_MODEL.');

  return text;
}
