const db = require('./src/config/db');
async function check() {
  try {
    const res = await db.query("SELECT count(*) FROM configuration_audit_logs");
    console.log("configuration_audit_logs count:", res.rows[0].count);
    const res2 = await db.query("SELECT count(*) FROM config_change_logs");
    console.log("config_change_logs count:", res2.rows[0].count);
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
check();
