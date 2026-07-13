exports.shorthands = undefined;

// ENT-06 Message. DB-09: message_type CHECK IN ('general','change_request','system')
// (swagger.json MessageType / 7-execution-plan.md DB-09 기준, ERD 문서의 'system_result'
// 표기 대신 API 계약과 실행계획을 따름). author_id nullable 조합을 CHECK로 강제해
// 시스템 메시지만 작성자가 없음을 DB 레벨로 보증(BR-13).
exports.up = (pgm) => {
  pgm.createTable('messages', {
    id: { type: 'bigserial', primaryKey: true },
    team_id: { type: 'bigint', notNull: true, references: 'teams', onDelete: 'cascade' },
    author_id: { type: 'bigint', references: 'users', onDelete: 'set null' },
    message_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "message_type IN ('general','change_request','system')",
    },
    content: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('messages', 'messages_system_author_null', {
    check:
      "(message_type = 'system' AND author_id IS NULL) OR (message_type <> 'system' AND author_id IS NOT NULL)",
  });
};

exports.down = (pgm) => {
  pgm.dropTable('messages');
};
