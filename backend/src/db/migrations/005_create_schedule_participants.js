exports.shorthands = undefined;

// ENT-05 ScheduleParticipant. DB-08: UNIQUE(schedule_id,user_id),
// schedule_id ON DELETE CASCADE로 일정 삭제 시 참여자 레코드 함께 삭제(SC-05).
exports.up = (pgm) => {
  pgm.createTable('schedule_participants', {
    id: { type: 'bigserial', primaryKey: true },
    schedule_id: { type: 'bigint', notNull: true, references: 'schedules', onDelete: 'cascade' },
    user_id: { type: 'bigint', notNull: true, references: 'users', onDelete: 'cascade' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('schedule_participants', 'schedule_participants_schedule_id_user_id_key', {
    unique: ['schedule_id', 'user_id'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('schedule_participants');
};
