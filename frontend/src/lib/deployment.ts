export const isPublicDemo = import.meta.env['VITE_PUBLIC_DEMO_MODE'] === 'true';

export function apiUrl(path: string, base: string = import.meta.env['VITE_API_BASE_URL'] ?? ''): string {
  if (!path.startsWith('/api/')) throw new Error('Only API paths are supported.');
  if (!base) return path;
  const normalized = base.replace(/\/$/, '');
  const url = new URL(normalized);
  if (url.protocol !== 'https:' || url.origin !== normalized || url.username || url.password) {
    throw new Error('VITE_API_BASE_URL must be an HTTPS origin without a path.');
  }
  return normalized + path;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (isPublicDemo && !['GET', 'HEAD'].includes(init?.method ?? 'GET')) {
    return Promise.reject(new Error('This fictional public demo is read-only.'));
  }
  const url = apiUrl(path);
  return fetch(url, url === path ? init : { ...init, credentials: 'omit' });
}
