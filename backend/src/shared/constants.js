const ROLE = {
  LEADER: 'leader',
  MEMBER: 'member',
};

const MESSAGE_TYPE = {
  GENERAL: 'general',
  CHANGE_REQUEST: 'change_request',
  SYSTEM: 'system',
};

const CHANGE_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

module.exports = { ROLE, MESSAGE_TYPE, CHANGE_REQUEST_STATUS };
