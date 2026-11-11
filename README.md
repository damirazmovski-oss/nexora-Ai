# NEXORA AI

A responsive German/English AI chat app with its own assistant personality, dark/light themes, local chat history, PWA assets and a server-side Google Gemini connection. The project uses Node.js built-ins only; no npm dependencies are required.

## Included
- Responsive chat interface for phones, iPad and desktop
- Gemini API proxy; the API key is kept on the server, never sent to the browser
- German/English responses guided by the assistant's latest user message
- Multiple conversations stored in the current browser's local storage
- Dark and light themes
- PWA manifest, service worker and PNG app icons
- Request validation, a simple per-client rate limit, API timeout and safe error messages
- Health endpoint: `GET /api/health`

## Requirements
- Node.js 18 or newer (Node 20 LTS or newer recommended)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- Check the current free quota and model availability in your Google AI Studio account. Free usage is subject to Google's limits and terms.

## Configure locally
1. Copy `.env.example` to `.env`.
2. Put your key in `GEMINI_API_KEY`.
3. Keep `.env` private. It is excluded by `.gitignore`; never upload it to GitHub or put it in `public/`.
4. Optional: change `GEMINI_MODEL`. Default: `gemini-3.8-flash`.

Example `.env`:
```env
GEMINI_API_KEY=your_real_key_here
GEMINI_MODEL=gemini-3.8-flash
PORT=3000
```

## Run locally
```bash
npm start
```
Open `http://localhost:3000`. Check server status at `http://localhost:3000/api/health`.

## Publish with Render (free tier, subject to current limits)
1. Create a private repository on GitHub and upload the contents of this folder (the `nexora-ai` folder itself should be the repository root).
2. Confirm `.env` is not included in the repository.
3. In Render, create **New → Web Service**, connect the repository, and select the Free plan.
4. Set **Build Command** to `npm install` and **Start Command** to `npm start`.
5. In Render's **Environment** settings add `GEMINI_API_KEY` and (optionally) `GEMINI_MODEL=gemini-3.8-flash`.
6. Deploy and open the `*.onrender.com` URL. Test `/api/health`; `configured` should be `true`.

Render free web services can spin down after inactivity and take around a minute to wake up. Their filesystem is ephemeral. NEXORA's chats are stored in each user's browser, so they are not synced between devices and are not stored on Render.

## Add to iPad / iPhone home screen
Open the deployed HTTPS URL in Safari → Share → Add to Home Screen.

## Important limitations
- This is a personal starter app, not a multi-user service: there is no login, account system, cloud chat sync, database, or admin dashboard.
- Chat history is local to the browser/device. Clearing browser site data removes it.
- Recent conversation turns are sent to Google Gemini for context. Do not submit passwords, payment details, or other sensitive information.
- The server includes basic request validation and a lightweight rate limit, but it is not a hardened public multi-tenant production service. If you share it widely, add authentication, stronger abuse controls, monitoring and a persistent database.
- Gemini model access, free quota and pricing can change. A free API key does not mean unlimited free usage.

## Tests
Run `npm test` for automated server smoke tests (health endpoint, homepage/security headers, malformed JSON handling and unknown API routes). The browser script is also checked with `node --check`. A live Gemini response test requires a real API key and outbound network access; it is not part of the automated test suite.
