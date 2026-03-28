const db = require('./src/config/db');
async function check() {
  try {
    const res = await db.query("SELECT count(*) FROM audit_logs");
    console.log("audit_logs count:", res.rows[0].count);
    process.exit(0);
  } catch (e) {
    console.error("audit_logs doesnt exist?");
    process.exit(1);
  }
}
check();
