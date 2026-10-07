require('dotenv').config({ path: require('node:path').resolve(__dirname, '..', '.env') });

const { pool } = require('./database');

async function testConnection() {
  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connection successful.');
  } catch {
    console.error('PostgreSQL connection failed. Check the database environment configuration.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testConnection().catch(() => {
  console.error('PostgreSQL connection test failed.');
  process.exitCode = 1;
});
