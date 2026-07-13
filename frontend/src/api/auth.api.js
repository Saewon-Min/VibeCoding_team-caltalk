import { apiClient } from './apiClient';

export function signup({ name, email, password }) {
  return apiClient.post('/auth/signup', { name, email, password });
}

export function login({ email, password }) {
  return apiClient.post('/auth/login', { email, password });
}
