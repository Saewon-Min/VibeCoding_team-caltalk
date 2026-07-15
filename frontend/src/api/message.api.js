import { apiClient } from './apiClient';

export function getMessagesByDate(teamId, date, since) {
  return apiClient.get(`/teams/${teamId}/messages`, { date, since });
}

export function postMessage(teamId, content) {
  return apiClient.post(`/teams/${teamId}/messages`, { content });
}
