import axios from 'axios';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './auth';

const BASE_URL = (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_BASE_URL ?? '';

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 10_000
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

function drainQueue(token: string | null, error: unknown = null) {
  for (const waiter of pendingQueue) {
    if (token) waiter.resolve(token);
    else waiter.reject(error);
  }
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean };
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers['Authorization'] = `Bearer ${token}`;
            resolve(api(original));
          },
          reject
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) throw new Error('no_refresh_token');
      const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, { refreshToken });
      setTokens(data.accessToken, data.refreshToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
      drainQueue(data.accessToken);
      original.headers['Authorization'] = `Bearer ${data.accessToken}`;
      return api(original);
    } catch (refreshError) {
      drainQueue(null, refreshError);
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
