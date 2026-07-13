const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkConnection() {
  const result = await pool.query('SELECT 1');
  return result.rowCount === 1;
}

module.exports = { pool, checkConnection };
