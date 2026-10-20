import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    if (status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function extractMessage(err) {
  const data = err.response?.data;
  if (data && typeof data.detail === 'string') return data.detail;
  if (err.response?.status === 429) return 'Too many attempts. Try again later.';
  if (err.code === 'ERR_CANCELED') return 'Request aborted';
  return 'Request failed (status)';
}

export async function get(path) {
  try {
    const res = await api.get(path);
    return res.data;
  } catch (err) {
    throw new ApiError(err.response?.status || 0, extractMessage(err));
  }
}

export async function post(path, body) {
  try {
    const res = await api.post(path, body);
    return res.data;
  } catch (err) {
    throw new ApiError(err.response?.status || 0, extractMessage(err));
  }
}

export async function put(path, body) {
  try {
    const res = await api.put(path, body);
    return res.data;
  } catch (err) {
    throw new ApiError(err.response?.status || 0, extractMessage(err));
  }
}

export async function del(path) {
  try {
    const res = await api.delete(path);
    return res.data || null;
  } catch (err) {
    throw new ApiError(err.response?.status || 0, extractMessage(err));
  }
}

export async function postForm(path, formData) {
  try {
    const res = await api.post(path, formData);
    return res.data;
  } catch (err) {
    throw new ApiError(err.response?.status || 0, extractMessage(err));
  }
}

export async function getBlob(path) {
  return api.get(path, { responseType: 'blob' });
}

export default api;
