const db = require('../src/config/db')
const jobNo = process.argv[2] || 'JO-2026-0021'

async function main(){
  try{
    const res = await db.query("SELECT * FROM job_orders WHERE job_order_no = $1 LIMIT 1", [jobNo])
    console.log('found', res.rows.length)
    console.dir(res.rows[0], { depth: null })
  }catch(err){
    console.error(err.message)
  }finally{ process.exit(0) }
}

main()
