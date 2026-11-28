export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1/erp';

export function apiUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function apiWsUrl(path: string, baseUrl = API_BASE_URL): string {
  const url = new URL(baseUrl, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  return url.toString();
}
