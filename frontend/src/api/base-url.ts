export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1/erp';

export function apiUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
