require('dotenv').config();

const app = require('./app');
const { checkConnection } = require('./db/pool');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await checkConnection();
    console.log('[db] PostgreSQL 연결 성공');
  } catch (err) {
    console.error('[db] PostgreSQL 연결 실패:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[server] http://localhost:${PORT} 에서 기동됨`);
  });
}

start();
