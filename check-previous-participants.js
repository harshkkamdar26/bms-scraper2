require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkData() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    
    // Check total count
    const totalCount = await db.collection('previousYearParticipants').countDocuments();
    console.log(`\n📊 Total previousYearParticipants: ${totalCount}`);
    
    // Get a sample document
    const sample = await db.collection('previousYearParticipants').findOne({});
    console.log('\n📄 Sample document:');
    console.log(JSON.stringify(sample, null, 2));
    
    // Check how many have the 'years' field
    const withYears = await db.collection('previousYearParticipants').countDocuments({ years: { $exists: true } });
    console.log(`\n✅ Documents with 'years' field: ${withYears}`);
    
    // Check how many match the query we're using
    const matching = await db.collection('previousYearParticipants').countDocuments({
      years: { $in: [2019, 2020, 2021, 2022, 2023, 2024] }
    });
    console.log(`✅ Documents matching query: ${matching}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkData();
