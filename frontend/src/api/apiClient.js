const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const TOKEN_STORAGE_KEY = 'caltalk_token';

function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

let onUnauthorized = null;

function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(path, { method = 'GET', body, query } = {}) {
  const url = new URL(API_BASE_URL + path);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = {
      status: response.status,
      code: data?.error?.code || 'UNKNOWN_ERROR',
      message: data?.error?.message || '요청 처리 중 오류가 발생했습니다',
    };

    if (response.status === 401 && onUnauthorized) {
      onUnauthorized();
    }

    throw error;
  }

  return data;
}

export const apiClient = {
  get: (path, query) => request(path, { method: 'GET', query }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export { getToken, setToken, setUnauthorizedHandler };
