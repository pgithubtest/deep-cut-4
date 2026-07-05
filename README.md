# Deep Cut Companion, Vercel rebuild

This is a rebuilt version of the original single-file Claude prototype.

The important change: the browser no longer calls the AI company directly. The browser calls `/api/ai`, and that private backend route calls OpenAI using an API key stored in Vercel.

## What was changed

- Removed direct Claude API calls from the browser.
- Removed browser-side OpenAI voice key input.
- Added a private backend API route at `app/api/ai/route.js`.
- Added a replaceable AI provider layer at `lib/ai/`.
- Kept the same Deep Cut flow: enter artist, build discography, confirm albums, album intro, cold listen, track breakdown, album wrap.
- Voice is intentionally removed for this MVP. Add it later after comparing voice providers.

## Folder guide

- `app/page.jsx`: the visible app interface.
- `app/globals.css`: the visual styling.
- `app/api/ai/route.js`: private backend route. The browser talks to this, not directly to OpenAI.
- `lib/systemPrompt.js`: the Deep Cut prompt.
- `lib/ai/openaiProvider.js`: the OpenAI implementation.
- `lib/ai/index.js`: the provider switchboard. This is where you can later swap OpenAI for another provider.

## Local setup, optional

You only need this if you want to run it on your own computer before Vercel.

1. Install Node.js from https://nodejs.org if you do not already have it.
2. Open Terminal in this project folder.
3. Run:

```bash
npm install
```

4. Copy `.env.example` and rename the copy to `.env.local`.
5. Put your OpenAI key into `.env.local`:

```bash
OPENAI_API_KEY=sk-your-real-key-here
OPENAI_MODEL=gpt-5.5
```

6. Run:

```bash
npm run dev
```

7. Open the local address it gives you, usually:

```bash
http://localhost:3000
```

## Vercel setup

1. Create a new GitHub repository.
2. Upload/push this whole folder to that repository.
3. In Vercel, choose **Add New Project**.
4. Import the GitHub repository.
5. Framework preset should auto-detect as **Next.js**.
6. Before deploying, open **Environment Variables**.
7. Add:

```bash
OPENAI_API_KEY = your real OpenAI API key
OPENAI_MODEL = gpt-5.5
```

8. Deploy.
9. Open the Vercel URL.

## Safety note

Never put your real OpenAI API key into `app/page.jsx`, `app/globals.css`, or any file that runs in the browser.

In this rebuild, the key belongs only in:

- `.env.local` on your computer, or
- Vercel Environment Variables online.

## Cost note

Every time the app asks OpenAI for a discography, album intro, or song breakdown, it can cost API money. Start testing with short sessions and keep an eye on your OpenAI usage dashboard.

## Swapping AI provider later

Later, if you want to try another provider, create another provider file in `lib/ai/`, then change `lib/ai/index.js` to point to it.

The rest of the app should not need a full rewrite.
