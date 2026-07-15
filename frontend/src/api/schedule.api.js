import { apiClient } from './apiClient';

export function getSchedules(teamId, view, date) {
  return apiClient.get(`/teams/${teamId}/schedules`, { view, date });
}

export function createSchedule(teamId, payload) {
  return apiClient.post(`/teams/${teamId}/schedules`, payload);
}

export function updateSchedule(teamId, scheduleId, payload) {
  return apiClient.patch(`/teams/${teamId}/schedules/${scheduleId}`, payload);
}

export function deleteSchedule(teamId, scheduleId) {
  return apiClient.delete(`/teams/${teamId}/schedules/${scheduleId}`);
}

export function getScheduleDetail(teamId, scheduleId) {
  return apiClient.get(`/teams/${teamId}/schedules/${scheduleId}`);
}
