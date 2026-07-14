exports.shorthands = undefined;

// ENT-02 Team. DB-04: created_by FK로 팀 생성자 식별(BR-15 지원)
exports.up = (pgm) => {
  pgm.createTable('teams', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'varchar(100)', notNull: true },
    created_by: { type: 'bigint', notNull: true, references: 'users', onDelete: 'restrict' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('teams');
};
