import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CALLBACK_URL = 'gymapp://strava-callback';
const CLIENT_ID_KEY = 'strava_client_id';
const CLIENT_SECRET_KEY = 'strava_client_secret';
const SESSION_KEY = 'strava_session';
const PENDING_KEY = 'strava_oauth_pending';

export interface StravaCredentials { clientId: string; clientSecret: string }
export interface StravaSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athleteId: string;
  scope: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id?: number | string };
  scope?: string;
}

class StravaTokenError extends Error {
  constructor(readonly status: number) {
    super('Strava no pudo autorizar la conexión. Revisa las credenciales y el dominio de retorno.');
  }
}

export async function getStravaCredentials(): Promise<StravaCredentials | null> {
  if (Platform.OS === 'web') return null;
  const [clientId, clientSecret] = await Promise.all([
    SecureStore.getItemAsync(CLIENT_ID_KEY), SecureStore.getItemAsync(CLIENT_SECRET_KEY),
  ]);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function saveStravaCredentials(credentials: StravaCredentials): Promise<void> {
  if (Platform.OS === 'web') throw new Error('La vinculación con Strava requiere la app móvil.');
  if (!/^\d+$/.test(credentials.clientId.trim()) || !credentials.clientSecret.trim()) {
    throw new Error('Introduce el ID y el secreto de la aplicación de Strava.');
  }
  await SecureStore.setItemAsync(CLIENT_ID_KEY, credentials.clientId.trim());
  await SecureStore.setItemAsync(CLIENT_SECRET_KEY, credentials.clientSecret.trim());
}

export async function getStravaSession(): Promise<StravaSession | null> {
  if (Platform.OS === 'web') return null;
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StravaSession; } catch { return null; }
}

async function saveSession(session: StravaSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!response.ok) throw new StravaTokenError(response.status);
  const result = await response.json() as TokenResponse;
  if (!result.access_token || !result.refresh_token || !result.expires_at) {
    throw new Error('La respuesta de autorización de Strava está incompleta.');
  }
  return result;
}

export async function connectStrava(): Promise<void> {
  const credentials = await getStravaCredentials();
  if (!credentials) throw new Error('Configura primero las credenciales de Strava.');
  const state = Crypto.randomUUID();
  const query = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: CALLBACK_URL,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state,
  });
  await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify({ state, createdAt: Date.now() }));
  try {
    await Linking.openURL(`https://www.strava.com/oauth/mobile/authorize?${query.toString()}`);
  } catch (error) {
    await SecureStore.deleteItemAsync(PENDING_KEY);
    throw error;
  }
}

export async function completeStravaConnection(params: {
  state?: string; code?: string; scope?: string; error?: string;
}): Promise<StravaSession> {
  const pendingRaw = await SecureStore.getItemAsync(PENDING_KEY);
  const pending = pendingRaw ? JSON.parse(pendingRaw) as { state: string; createdAt: number } : null;
  if (!pending || params.state !== pending.state || Date.now() - pending.createdAt > 10 * 60_000) {
    throw new Error('La respuesta de Strava no coincide con la solicitud de conexión.');
  }
  if (params.error) {
    await SecureStore.deleteItemAsync(PENDING_KEY);
    throw new Error('La autorización de Strava fue rechazada.');
  }
  const code = params.code;
  const scope = params.scope || '';
  if (!code) throw new Error('Strava no devolvió el código de autorización.');
  if (!scope.split(/[\s,]+/).some((item) => item === 'activity:read_all' || item === 'activity:read')) {
    throw new Error('Es necesario conceder acceso de lectura a las actividades.');
  }
  const credentials = await getStravaCredentials();
  if (!credentials) throw new Error('Faltan las credenciales de la aplicación de Strava.');
  await SecureStore.deleteItemAsync(PENDING_KEY);
  const token = await tokenRequest({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
    grant_type: 'authorization_code',
  });
  if (token.athlete?.id == null) throw new Error('Strava no devolvió la cuenta del deportista.');
  const session: StravaSession = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
    athleteId: String(token.athlete.id),
    scope: token.scope || scope,
  };
  await saveSession(session);
  return session;
}

export async function refreshStravaSession(force = false): Promise<StravaSession> {
  const session = await getStravaSession();
  const credentials = await getStravaCredentials();
  if (!session || !credentials) throw new Error('Vuelve a conectar tu cuenta de Strava.');
  if (!force && session.expiresAt > Date.now() / 1000 + 3600) return session;
  let token: TokenResponse;
  try {
    token = await tokenRequest({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    });
  } catch (error) {
    if (error instanceof StravaTokenError && (error.status === 400 || error.status === 401)) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      throw new Error('Strava ha revocado el acceso. Vuelve a vincular tu cuenta.');
    }
    throw error;
  }
  const updated = {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
  };
  await saveSession(updated);
  return updated;
}

// Basic Auth del endpoint de revocación vigente, sin dependencias de Node.
function asciiBase64(value: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = Array.from(new TextEncoder().encode(value));
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index], b = bytes[index + 1], c = bytes[index + 2];
    output += alphabet[a >> 2];
    output += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    output += b == null ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    output += c == null ? '=' : alphabet[c & 63];
  }
  return output;
}

export async function disconnectStrava(): Promise<void> {
  const [session, credentials] = await Promise.all([getStravaSession(), getStravaCredentials()]);
  if (session && credentials) {
    const response = await fetch('https://www.strava.com/oauth/revoke', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${asciiBase64(`${credentials.clientId}:${credentials.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: session.refreshToken, token_type_hint: 'refresh_token' }).toString(),
    });
    if (!response.ok) throw new Error('No se pudo revocar el acceso en Strava. Inténtalo de nuevo.');
  }
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(SESSION_KEY);
}
