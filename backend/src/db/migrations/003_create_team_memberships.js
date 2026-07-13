exports.shorthands = undefined;

// ENT-03 TeamMembership. DB-05: UNIQUE(team_id,user_id)로 중복 소속 차단(BR-08),
// role CHECK로 팀장/팀원만 허용. user_id 단독 유니크는 두지 않아 한 사용자가
// 여러 팀에 서로 다른 역할로 소속될 수 있음을 스키마로 보장한다(BR-08).
exports.up = (pgm) => {
  pgm.createTable('team_memberships', {
    id: { type: 'bigserial', primaryKey: true },
    team_id: { type: 'bigint', notNull: true, references: 'teams', onDelete: 'cascade' },
    user_id: { type: 'bigint', notNull: true, references: 'users', onDelete: 'cascade' },
    role: { type: 'varchar(20)', notNull: true, check: "role IN ('leader','member')" },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('team_memberships', 'team_memberships_team_id_user_id_key', {
    unique: ['team_id', 'user_id'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('team_memberships');
};
