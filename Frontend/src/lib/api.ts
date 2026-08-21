import axios, { AxiosRequestConfig } from 'axios';
import logger from './logger';

/**
 * Every backend response is wrapped by ApiResponse
 * (Backend/src/common/utils/ApiResponse.js), and the response interceptor
 * below unwraps the axios envelope — so what a caller awaits is this shape,
 * not an AxiosResponse. Axios's own types can't express that, which is why
 * every call site used to cast through `any` and then re-assert the payload
 * type by hand; those casts were unchecked, so a mismatch between what the
 * API returns and what the page expects showed up as a runtime undefined
 * rather than a compile error.
 */
export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Clears the stored session. Exported so AuthContext logs out through one path. */
export function clearStoredSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// Add a request interceptor to add the auth token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status;
    // Set by the API's requestContext middleware and exposed via CORS. Sending
    // it back up with the client report is what lets one search find both the
    // browser-side error and the server-side lines for the same request.
    const requestId: string | undefined =
      error.response?.headers?.['x-request-id'] ?? error.response?.data?.requestId;

    // The JWT is valid for 7 days, so an expired or revoked token is a normal
    // occurrence rather than an edge case. Without this the stale token stays
    // in localStorage, the UI keeps rendering as a logged-in user, and every
    // action fails with an unexplained error. Clear it and send them to log in
    // — but never bounce off the login page itself, where a 401 just means
    // "wrong password".
    if (status === 401 && !error.config?.url?.includes('/auth/')) {
      clearStoredSession();
      if (!window.location.pathname.startsWith('/login')) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?next=${next}&expired=1`);
      }
    }

    let message: string = error.response?.data?.message || 'Something went wrong';
    if (!error.response) {
      // No response at all: offline, DNS failure, or the API is down. The
      // default axios message ("Network Error") tells a user nothing.
      message = 'Cannot reach the server. Check your connection and try again.';
    }

    const context = {
      method: error.config?.method?.toUpperCase(),
      // Path only — a URL can embed ids, and query strings can carry search
      // terms. Enough to identify the endpoint, nothing more.
      url: (error.config?.url ?? '').split('?')[0],
      status,
      requestId,
    };

    // A 4xx is the API correctly refusing something (bad password, slot gone)
    // — expected traffic, not a fault. 5xx and transport failures are.
    if (!error.response || status >= 500) {
      logger.error('API request failed', error, context);
    } else if (status !== 401 && status !== 404) {
      logger.warn(`API rejected request: ${message}`, context);
    } else {
      logger.debug('API returned ' + status, context);
    }

    return Promise.reject(new Error(message));
  }
);

export default api;

/** Typed wrappers. Prefer these over `api.get` so the payload type is checked. */
export const apiGet = <T>(url: string, config?: AxiosRequestConfig) =>
  api.get(url, config) as unknown as Promise<ApiEnvelope<T>>;

export const apiPost = <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
  api.post(url, body, config) as unknown as Promise<ApiEnvelope<T>>;

export const apiPatch = <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
  api.patch(url, body, config) as unknown as Promise<ApiEnvelope<T>>;

export const apiDelete = <T>(url: string, config?: AxiosRequestConfig) =>
  api.delete(url, config) as unknown as Promise<ApiEnvelope<T>>;

/**
 * Multipart upload with progress.
 *
 * `Content-Type` is explicitly cleared: the shared instance defaults to
 * application/json, and if that default survives, the browser can't append the
 * multipart boundary and the server sees a body it cannot parse.
 */
export const apiUpload = <T>(
  url: string,
  formData: FormData,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {}
) =>
  api.post(url, formData, {
    headers: { 'Content-Type': undefined },
    signal: options.signal,
    onUploadProgress: (event) => {
      if (!options.onProgress || !event.total) return;
      options.onProgress(Math.round((event.loaded / event.total) * 100));
    },
  }) as unknown as Promise<ApiEnvelope<T>>;
