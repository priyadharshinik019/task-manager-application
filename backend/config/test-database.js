const { pool } = require('./database');

async function testConnection() {
  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connection successful.');
  } catch (error) {
    console.error('PostgreSQL connection failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testConnection().catch((error) => {
  console.error('PostgreSQL connection test failed:', error.message);
  process.exitCode = 1;
});
