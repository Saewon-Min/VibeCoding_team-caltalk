exports.shorthands = undefined;

// ENT-04 Schedule. DB-07: team_id NOT NULL FK로 단일 팀 귀속(BR-07),
// CHECK(end_at > start_at). BR-02 쓰기 권한 검증은 Service 계층 책임(BE-12).
exports.up = (pgm) => {
  pgm.createTable('schedules', {
    id: { type: 'bigserial', primaryKey: true },
    team_id: { type: 'bigint', notNull: true, references: 'teams', onDelete: 'cascade' },
    title: { type: 'varchar(200)', notNull: true },
    description: { type: 'text' },
    start_at: { type: 'timestamptz', notNull: true },
    end_at: { type: 'timestamptz', notNull: true },
    created_by: { type: 'bigint', notNull: true, references: 'users', onDelete: 'restrict' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('schedules', 'schedules_end_at_after_start_at', {
    check: 'end_at > start_at',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('schedules');
};
