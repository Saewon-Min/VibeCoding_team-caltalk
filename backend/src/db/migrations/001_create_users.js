exports.shorthands = undefined;

// ENT-01 User. DB-03: email UNIQUE NOT NULL, password_hash NOT NULL(평문 컬럼 없음, BR-01/BR-14)
exports.up = (pgm) => {
  pgm.createTable('users', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'varchar(100)', notNull: true },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
