require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkSchema() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    console.log('Fetching database schema...');
    
    // Get list of all tables and their columns in one query
    const { data, error } = await supabase.rpc('get_schema_info');
    
    if (error) {
      console.error('Error fetching schema:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.log('No tables found in the database.');
      return;
    }

    console.log('\n=== Database Schema ===');
    
    // Group by table name
    const tables = {};
    data.forEach(row => {
      if (!tables[row.table_name]) {
        tables[row.table_name] = [];
      }
      tables[row.table_name].push({
        column_name: row.column_name,
        data_type: row.data_type,
        is_nullable: row.is_nullable
      });
    });

    // Print the schema
    Object.entries(tables).forEach(([tableName, columns]) => {
      console.log(`\nTable: ${tableName}`);
      console.log('Columns:');
      columns.forEach(column => {
        console.log(`  - ${column.column_name.padEnd(25)} ${column.data_type.padEnd(20)} ${column.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
    });
    
  } catch (error) {
    console.error('Error checking schema:', error.message);
  }
}

checkSchema();
