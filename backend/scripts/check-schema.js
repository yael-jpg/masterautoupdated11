const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin123',
  database: 'masterauto_db',
});

async function main() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'job_orders' AND column_name IN ('assigned_installers', 'prepared_by');
  `);
  console.log(res.rows);
  
  if (!res.rows.find(r => r.column_name === 'prepared_by')) {
     console.log('Adding prepared_by column...');
     await pool.query('ALTER TABLE job_orders ADD COLUMN prepared_by jsonb DEFAULT \'[]\'::jsonb;');
     console.log('Added prepared_by column.');
  }

  pool.end();
}

main().catch(console.error);
