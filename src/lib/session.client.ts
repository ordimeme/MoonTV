import { SessionRole } from './session';

export interface ClientSession {
  username?: string;
  role: SessionRole;
}

const SESSION_CACHE_KEY = 'moontv-session';

export function getCachedSession(): ClientSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = sessionStorage.getItem(SESSION_CACHE_KEY);
    return value ? (JSON.parse(value) as ClientSession) : null;
  } catch {
    return null;
  }
}

export async function fetchSession(): Promise<ClientSession | null> {
  try {
    const response = await fetch('/api/session', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const session = (await response.json()) as ClientSession;
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
    return session;
  } catch {
    return null;
  }
}

export function clearCachedSession(): void {
  if (typeof window !== 'undefined')
    sessionStorage.removeItem(SESSION_CACHE_KEY);
}
