require('dotenv').config();

const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');

const SEED_PASSWORD = 'password123';

const USERS = [
  { name: '김철수', email: 'kim.leader@techteam.io' },
  { name: '이서연', email: 'lee.member@techteam.io' },
  { name: '박준영', email: 'park.member@techteam.io' },
  { name: '최유진', email: 'choi.member@techteam.io' },
  { name: '정다은', email: 'dain.lead@designteam.io' },
];

const SCHEDULES = [
  {
    title: '스프린트 계획 회의',
    description: null,
    start_at: '2026-07-14T10:00:00+09:00',
    end_at: '2026-07-14T11:00:00+09:00',
    participants: ['lee.member@techteam.io', 'park.member@techteam.io'],
  },
  {
    title: '레거시 코드 리뷰',
    description: null,
    start_at: '2026-07-17T14:00:00+09:00',
    end_at: '2026-07-17T15:00:00+09:00',
    participants: ['park.member@techteam.io'],
  },
  {
    title: '고객 데모 준비',
    description: null,
    start_at: '2026-07-16T15:00:00+09:00',
    end_at: '2026-07-16T16:00:00+09:00',
    participants: ['choi.member@techteam.io'],
  },
  {
    title: '코드 프리즈 점검 회의',
    description: null,
    start_at: '2026-07-21T09:00:00+09:00',
    end_at: '2026-07-21T10:00:00+09:00',
    participants: ['lee.member@techteam.io', 'park.member@techteam.io', 'choi.member@techteam.io'],
  },
];

async function upsertUser(client, { name, email }) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const result = await client.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, email`,
    [name, email, passwordHash],
  );
  return result.rows[0];
}

async function upsertTeam(client, name, creatorId) {
  const existing = await client.query('SELECT id FROM teams WHERE name = $1', [name]);
  if (existing.rowCount > 0) {
    return existing.rows[0].id;
  }
  const result = await client.query(
    'INSERT INTO teams (name, created_by) VALUES ($1, $2) RETURNING id',
    [name, creatorId],
  );
  return result.rows[0].id;
}

async function upsertMembership(client, teamId, userId, role) {
  await client.query(
    `INSERT INTO team_memberships (team_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id, user_id) DO NOTHING`,
    [teamId, userId, role],
  );
}

async function upsertSchedule(client, teamId, createdBy, usersByEmail, schedule) {
  const existing = await client.query(
    'SELECT id FROM schedules WHERE team_id = $1 AND title = $2',
    [teamId, schedule.title],
  );
  let scheduleId;
  if (existing.rowCount > 0) {
    scheduleId = existing.rows[0].id;
  } else {
    const result = await client.query(
      `INSERT INTO schedules (team_id, title, description, start_at, end_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [teamId, schedule.title, schedule.description, schedule.start_at, schedule.end_at, createdBy],
    );
    scheduleId = result.rows[0].id;
  }

  for (const participantEmail of schedule.participants) {
    const participant = usersByEmail.get(participantEmail);
    await client.query(
      `INSERT INTO schedule_participants (schedule_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (schedule_id, user_id) DO NOTHING`,
      [scheduleId, participant.id],
    );
  }
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const usersByEmail = new Map();
    for (const user of USERS) {
      const row = await upsertUser(client, user);
      usersByEmail.set(row.email, row);
    }

    const kim = usersByEmail.get('kim.leader@techteam.io');
    const dain = usersByEmail.get('dain.lead@designteam.io');

    const techTeamId = await upsertTeam(client, '테크팀', kim.id);
    await upsertMembership(client, techTeamId, kim.id, 'leader');
    await upsertMembership(client, techTeamId, usersByEmail.get('lee.member@techteam.io').id, 'member');
    await upsertMembership(client, techTeamId, usersByEmail.get('park.member@techteam.io').id, 'member');
    await upsertMembership(client, techTeamId, usersByEmail.get('choi.member@techteam.io').id, 'member');

    const designTeamId = await upsertTeam(client, '디자인팀', dain.id);
    await upsertMembership(client, designTeamId, dain.id, 'leader');
    // BR-08 예시: 김팀장은 테크팀에서는 팀장, 디자인팀에서는 팀원으로 소속
    await upsertMembership(client, designTeamId, kim.id, 'member');

    for (const schedule of SCHEDULES) {
      await upsertSchedule(client, techTeamId, kim.id, usersByEmail, schedule);
    }

    await client.query('COMMIT');
    console.log('시드 데이터 생성 완료 (비밀번호: %s)', SEED_PASSWORD);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('시드 실패:', err);
  process.exit(1);
});
