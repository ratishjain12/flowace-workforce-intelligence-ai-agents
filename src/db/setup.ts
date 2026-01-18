import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function setup() {
  // First connect without database to create it
  const adminPool = new Pool({
    host: 'localhost',
    user: 'postgres',
    password: 'root',
    database: 'postgres', // Connect to default database
    port: 5432,
  });

  try {
    // Check if database exists
    const dbCheck = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'flowace'"
    );

    if (dbCheck.rowCount === 0) {
      console.log('Creating database flowace...');
      await adminPool.query('CREATE DATABASE flowace');
      console.log('Database created successfully');
    } else {
      console.log('Database flowace already exists');
    }
  } catch (error) {
    console.error('Error checking/creating database:', error);
  } finally {
    await adminPool.end();
  }

  // Now connect to the flowace database and run schema
  const pool = new Pool({
    host: 'localhost',
    user: 'postgres',
    password: 'root',
    database: 'flowace',
    port: 5432,
  });

  try {
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    console.log('Running schema...');
    await pool.query(schema);
    console.log('Schema created successfully');

    // Verify tables
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\nCreated tables:');
    tables.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });

    // Check pgvector extension
    const extensions = await pool.query(`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname = 'vector'
    `);

    if (extensions.rowCount && extensions.rowCount > 0) {
      console.log(`\npgvector extension installed: v${extensions.rows[0].extversion}`);
    } else {
      console.log('\nWARNING: pgvector extension not found. Please install it first.');
      console.log('Run: brew install pgvector');
    }
  } catch (error) {
    console.error('Error running schema:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

setup()
  .then(() => {
    console.log('\nDatabase setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
