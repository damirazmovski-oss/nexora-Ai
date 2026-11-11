import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// Tiny .env loader keeps the project dependency-free.
try {
  const env = await readFile(new URL('./.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch {}

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const API_KEY = process.env.GEMINI_API_KEY || '';
const PUBLIC_DIR = resolve(process.cwd(), 'public');
const SYSTEM = `You are NEXORA, a personal AI assistant. Your personality is friendly, intelligent, calm, naturally conversational, helpful, respectful, curious, and clear. Answer in the same language as the user's latest message (especially German or English). Use natural language, explain things accessibly, structure longer answers with concise headings or bullets, and be honest about uncertainty. Never claim to have performed actions you cannot perform. Your name is NEXORA. Do not claim to be Google Gemini.`;
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const rateBuckets = new Map();

function headers(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}
function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(payload));
}
async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 256_000) throw Object.assign(new Error('Die Anfrage ist zu groß.'), { status:413 });
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw Object.assign(new Error('Ungültige Anfrage. Bitte versuche es erneut.'), { status:400 }); }
}
function rateLimit(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.started > 60_000) {
    rateBuckets.set(ip, { started:now, count:1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= 20;
}
async function chat(req, res) {
  if (!rateLimit(req)) return json(res, 429, { error:'Zu viele Anfragen in kurzer Zeit. Bitte warte eine Minute.' });
  if (!API_KEY || API_KEY.includes('PASTE_YOUR')) return json(res, 503, { error:'Die Gemini-Verbindung ist noch nicht eingerichtet. Hinterlege GEMINI_API_KEY in den Server-Umgebungsvariablen.' });

  const data = await readJson(req);
  if (!Array.isArray(data.messages) || data.messages.length === 0) return json(res, 400, { error:'Bitte schreibe zuerst eine Nachricht.' });
  if (data.messages.length > 40) return json(res, 400, { error:'Der Chat ist zu lang. Bitte starte einen neuen Chat.' });

  const messages = [];
  for (const item of data.messages) {
    if (!item || !['user','assistant'].includes(item.role) || typeof item.content !== 'string') continue;
    const content = item.content.trim();
    if (!content) continue;
    if (content.length > 12_000) return json(res, 413, { error:'Eine Nachricht ist zu lang (maximal 12.000 Zeichen).' });
    const role = item.role === 'assistant' ? 'model' : 'user';
    // Gemini expects turns to alternate. Ignore malformed duplicate role turns.
    if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].parts[0].text += `\n\n${content}`;
    else messages.push({ role, parts:[{ text:content }] });
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json(res, 400, { error:'Die letzte Nachricht muss von dir stammen.' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method:'POST', signal:controller.signal,
      headers:{ 'Content-Type':'application/json', 'x-goog-api-key':API_KEY },
      body:JSON.stringify({ systemInstruction:{ parts:[{ text:SYSTEM }] }, contents:messages, generationConfig:{ temperature:0.75, maxOutputTokens:3072 } })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status === 429 ? 429 : response.status === 400 ? 400 : response.status === 401 || response.status === 403 ? 502 : 502;
      let detail = result?.error?.message || `Gemini API Fehler (${response.status}).`;
      if (response.status === 400 && /model/i.test(detail)) detail += ` Prüfe GEMINI_MODEL (aktuell: ${MODEL}).`;
      if (response.status === 401 || response.status === 403) detail = 'Google hat den API-Schlüssel abgelehnt. Prüfe deinen Gemini-Schlüssel und den API-Zugriff.';
      return json(res, status, { error:detail });
    }
    const answer = result?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
    if (!answer) {
      const reason = result?.promptFeedback?.blockReason;
      return json(res, 502, { error:reason ? 'Diese Anfrage konnte aus Sicherheitsgründen nicht beantwortet werden.' : 'Gemini hat keine Textantwort zurückgegeben. Bitte versuche es erneut.' });
    }
    return json(res, 200, { answer, model:MODEL });
  } catch (error) {
    if (error.name === 'AbortError') return json(res, 504, { error:'Die Antwort hat zu lange gedauert. Bitte versuche es erneut.' });
    throw error;
  } finally { clearTimeout(timeout); }
}

const server = http.createServer(async (req, res) => {
  headers(res);
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { return json(res, 400, { error:'Ungültige URL.' }); }

  if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { ok:true, app:'NEXORA AI', model:MODEL, configured:Boolean(API_KEY && !API_KEY.includes('PASTE_YOUR')) });
  if (req.method === 'POST' && pathname === '/api/chat') {
    try { return await chat(req, res); }
    catch (error) { return json(res, error.status || 500, { error:error.status ? error.message : 'Ein Serverfehler ist aufgetreten. Bitte versuche es später erneut.' }); }
  }
  if (pathname.startsWith('/api/')) return json(res, 404, { error:'API-Endpunkt nicht gefunden.' });
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, { 'Allow':'GET, HEAD' }); return res.end('Method not allowed'); }

  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { res.writeHead(400); return res.end('Bad request'); }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filePath = resolve(PUBLIC_DIR, relative);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const file = await readFile(filePath);
    res.writeHead(200, { 'Content-Type':MIME[extname(filePath)] || 'application/octet-stream', 'Cache-Control':relative === 'index.html' ? 'no-cache' : 'public, max-age=3600' });
    return res.end(req.method === 'HEAD' ? undefined : file);
  } catch { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); return res.end('Not found'); }
});

server.listen(PORT, '0.0.0.0', () => console.log(`NEXORA AI läuft auf Port ${PORT} · Modell: ${MODEL}`));
