exports.shorthands = undefined;

// ENT-07 ScheduleChangeRequest. DB-10: message_id NOT NULL UNIQUE FK로 요청과 채팅
// 메시지 1:1 연결(BR-04 구조적 전제), status CHECK로 4개 상태만 허용.
exports.up = (pgm) => {
  pgm.createTable('schedule_change_requests', {
    id: { type: 'bigserial', primaryKey: true },
    schedule_id: { type: 'bigint', notNull: true, references: 'schedules', onDelete: 'cascade' },
    message_id: {
      type: 'bigint',
      notNull: true,
      unique: true,
      references: 'messages',
      onDelete: 'cascade',
    },
    requester_id: { type: 'bigint', notNull: true, references: 'users', onDelete: 'restrict' },
    proposed_title: { type: 'varchar(200)' },
    proposed_start_at: { type: 'timestamptz' },
    proposed_end_at: { type: 'timestamptz' },
    reason: { type: 'text' },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending','approved','rejected','cancelled')",
    },
    processed_by: { type: 'bigint', references: 'users', onDelete: 'set null' },
    processed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('schedule_change_requests');
};
