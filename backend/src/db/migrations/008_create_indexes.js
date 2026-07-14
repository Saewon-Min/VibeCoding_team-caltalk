exports.shorthands = undefined;

// DB-11: 조회 성능 인덱스. BR-03/06/11/16 대응 쿼리에서 Index Scan 사용을 위함.
exports.up = (pgm) => {
  pgm.createIndex('team_memberships', 'user_id', { name: 'idx_team_memberships_user_id' });
  pgm.createIndex('schedules', ['team_id', 'start_at'], {
    name: 'idx_schedules_team_id_start_time',
  });
  pgm.createIndex('schedule_participants', 'schedule_id', {
    name: 'idx_schedule_participants_schedule_id',
  });
  pgm.createIndex('schedule_participants', 'user_id', {
    name: 'idx_schedule_participants_user_id',
  });
  pgm.createIndex('messages', ['team_id', 'created_at'], {
    name: 'idx_messages_team_id_created_at',
  });
  pgm.createIndex('schedule_change_requests', ['schedule_id', 'status'], {
    name: 'idx_change_requests_schedule_id_status',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('team_memberships', 'user_id', { name: 'idx_team_memberships_user_id' });
  pgm.dropIndex('schedules', ['team_id', 'start_at'], {
    name: 'idx_schedules_team_id_start_time',
  });
  pgm.dropIndex('schedule_participants', 'schedule_id', {
    name: 'idx_schedule_participants_schedule_id',
  });
  pgm.dropIndex('schedule_participants', 'user_id', {
    name: 'idx_schedule_participants_user_id',
  });
  pgm.dropIndex('messages', ['team_id', 'created_at'], {
    name: 'idx_messages_team_id_created_at',
  });
  pgm.dropIndex('schedule_change_requests', ['schedule_id', 'status'], {
    name: 'idx_change_requests_schedule_id_status',
  });
};
