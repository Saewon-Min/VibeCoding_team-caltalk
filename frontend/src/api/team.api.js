import { apiClient } from './apiClient';

export function createTeam(name) {
  return apiClient.post('/teams', { name });
}

export function getMyTeams() {
  return apiClient.get('/teams');
}

export function searchMemberByEmail(teamId, email) {
  return apiClient.get(`/teams/${teamId}/members/search`, { email });
}

export function getMembers(teamId) {
  return apiClient.get(`/teams/${teamId}/members`);
}

export function addMember(teamId, userId) {
  return apiClient.post(`/teams/${teamId}/members`, { userId });
}

export function updateMemberRole(teamId, userId, role) {
  return apiClient.patch(`/teams/${teamId}/members/${userId}`, { role });
}

export function removeMember(teamId, userId) {
  return apiClient.delete(`/teams/${teamId}/members/${userId}`);
}
