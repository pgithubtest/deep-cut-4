import { createTextResponse } from './openaiProvider';

// Provider layer.
// Today this uses OpenAI. Later, replace this file or add another provider
// without rewriting the whole app.
export async function askAI(options) {
  return createTextResponse(options);
}
