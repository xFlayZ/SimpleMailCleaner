import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {const result=await pool.query("SELECT count(*) FILTER(WHERE status='running')::int AS running,count(*) FILTER(WHERE status='queued')::int AS queued FROM jobs");console.log(JSON.stringify(result.rows[0]));}
finally{await pool.end();}
