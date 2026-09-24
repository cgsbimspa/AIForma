import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
const url=process.env.MEMORY_MIGRATION_DATABASE_URL??process.env.MEMORY_DATABASE_URL;
if(!url)throw Error('Database connection is required');
const sql=postgres(url,{max:1,ssl:['localhost','127.0.0.1'].includes(new URL(url).hostname)?false:'verify-full',onnotice:()=>{}});
try {
 const exists=await sql`SELECT to_regclass('public.quantity_schema_version') AS table_name`;
 if(exists[0].table_name && (await sql`SELECT version FROM quantity_schema_version WHERE version=1`).length) console.log('Quantity schema v1 already installed.');
 else {await sql.unsafe(await readFile(new URL('../db/quantities.sql',import.meta.url),'utf8'));console.log('Quantity schema v1 installed.');}
} finally {await sql.end();}
