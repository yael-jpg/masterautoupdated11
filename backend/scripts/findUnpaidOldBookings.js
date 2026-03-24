const db = require('../src/config/db')

async function main(){
  const hours = 1
  const query = `SELECT a.id, a.quotation_id, a.status, a.created_at, COALESCE(qps.total_paid,0)::numeric AS total_paid
  FROM appointments a
  LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = a.quotation_id
  WHERE a.status = 'Scheduled'
    AND a.created_at < NOW() - INTERVAL '${hours} hour'
    AND COALESCE(qps.total_paid,0) = 0
  ORDER BY a.created_at DESC
  LIMIT 100`
  try{
    const res = await db.query(query)
    console.log('found', res.rows.length)
    console.dir(res.rows, { depth: null })
  }catch(err){
    console.error(err)
  }finally{
    process.exit(0)
  }
}

main()
