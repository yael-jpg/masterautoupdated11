const db = require('../src/config/db')

async function main(){
  try{
    const res = await db.query("SELECT value FROM system_config WHERE category='booking' AND key='auto_cancel_unpaid_hours' LIMIT 1")
    console.log('setting rows:', res.rows)
  }catch(err){
    console.error('err', err.message)
  } finally {
    process.exit(0)
  }
}

main()
