import path from 'node:path';

export const APP_ORIGIN = 'aibridge://app';
const CHAT_HOSTS = new Set(['chatgpt.com', 'auth.openai.com', 'auth0.openai.com', 'platform.openai.com', 'accounts.google.com', 'login.live.com', 'login.microsoftonline.com', 'appleid.apple.com']);
export function trustedUrl(url) {
  try { const u = new URL(url); return u.protocol === 'aibridge:' && u.hostname === 'app' && !u.username && !u.password && !u.port; } catch { return false; }
}
export function chatNavigation(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && CHAT_HOSTS.has(u.hostname) && !u.username && !u.password && (!u.port || u.port === '443'); } catch { return false; }
}
export function externalUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password && url.length < 4096; } catch { return false; }
}
export function resourcePath(root, url) {
  if (!trustedUrl(url)) return null;
  let name; try { name = decodeURIComponent(new URL(url).pathname); } catch { return null; }
  if (name.includes('\\') || name.includes('\0') || name.split('/').includes('..')) return null;
  const resolved = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  const relative = path.relative(root, resolved);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? resolved : null;
}
export function downloadName(name, id) {
  const safe = path.basename(String(name).replaceAll('\\', '/')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);
  const ext = path.extname(safe).toLowerCase();
  if (!['.xlsx', '.csv', '.pptx', '.pdf', '.docx', '.txt', '.md', '.json', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return null;
  return `${path.basename(safe, path.extname(safe)) || 'AI-Bridge'}-${id}${ext}`;
}
