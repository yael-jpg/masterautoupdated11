const db = require('../src/config/db');

async function deleteCustomer() {
  const name = 'Joshua Lunaa';
  try {
    const res = await db.query('SELECT id, full_name FROM customers WHERE full_name ILIKE $1', [name]);
    if (res.rows.length === 0) {
      console.log(`Customer "${name}" not found.`);
    } else {
      for (const customer of res.rows) {
        console.log(`Deleting customer: ${customer.full_name} (ID: ${customer.id})...`);
        // Use CASCADE just in case there are lingering links, though transactional data was truncated
        await db.query('DELETE FROM customers WHERE id = $1', [customer.id]);
        console.log('Customer deleted successfully.');
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    process.exit();
  }
}

deleteCustomer();
