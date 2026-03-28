const db = require('./src/config/db');

async function checkCounts() {
  try {
    const res = await db.query(`
      SELECT 
        (SELECT count(*) FROM sales) as sales_count,
        (SELECT count(*) FROM customers) as customers_count,
        (SELECT count(*) FROM vehicle_makes) as makes_count,
        (SELECT count(*) FROM users) as users_count
    `);
    console.log(JSON.stringify(res.rows[0], null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkCounts();
