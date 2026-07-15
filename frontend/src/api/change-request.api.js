import { apiClient } from './apiClient';

export function createChangeRequest(teamId, scheduleId, payload) {
  return apiClient.post(`/teams/${teamId}/schedules/${scheduleId}/change-requests`, payload);
}

export function approveChangeRequest(teamId, requestId) {
  return apiClient.patch(`/teams/${teamId}/change-requests/${requestId}/approve`);
}

export function rejectChangeRequest(teamId, requestId) {
  return apiClient.patch(`/teams/${teamId}/change-requests/${requestId}/reject`);
}

export function cancelChangeRequest(teamId, requestId) {
  return apiClient.patch(`/teams/${teamId}/change-requests/${requestId}/cancel`);
}
