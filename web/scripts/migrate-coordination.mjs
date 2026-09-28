import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
const url=process.env.MEMORY_MIGRATION_DATABASE_URL??process.env.MEMORY_DATABASE_URL;
if(!url)throw Error('Database connection is required');
const sql=postgres(url,{max:1,ssl:['localhost','127.0.0.1'].includes(new URL(url).hostname)?false:'verify-full',onnotice:()=>{}});
try{const rows=await sql`SELECT to_regclass('public.coordination_record') AS name`;if(rows[0].name)console.log('Coordination schema already installed.');else{await sql.unsafe(await readFile(new URL('../db/coordination.sql',import.meta.url),'utf8'));console.log('Coordination schema installed.');}}finally{await sql.end();}
