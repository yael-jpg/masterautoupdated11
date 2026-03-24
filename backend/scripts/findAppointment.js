const db = require('../src/config/db')
const id = process.argv[2] || 20

async function main(){
  try{
    const res = await db.query('SELECT * FROM appointments WHERE id = $1 LIMIT 1', [id])
    console.log('found', res.rows.length)
    console.dir(res.rows[0], { depth: null })
  }catch(err){
    console.error(err.message)
  }finally{ process.exit(0) }
}

main()
