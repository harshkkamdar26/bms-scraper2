require('dotenv').config();
const { MongoClient } = require('mongodb');

async function check() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('Total:', await db.collection('previousYearParticipants').countDocuments());
    
    const sample = await db.collection('previousYearParticipants').findOne({});
    console.log('\nSample document structure:');
    console.log(JSON.stringify(sample, null, 2));
    
    // Check how many have 'years' as an array
    const withYearsArray = await db.collection('previousYearParticipants').countDocuments({ years: { $type: 'array' } });
    console.log(`\nDocuments with 'years' as array: ${withYearsArray}`);
    
  } finally {
    await client.close();
  }
}

check();
