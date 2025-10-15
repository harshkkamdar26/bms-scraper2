require('dotenv').config();
const { MongoClient } = require('mongodb');

async function verifyTicketCount() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db();
    
    // Get event summary
    const eventSummary = await db.collection('eventSummaries').findOne();
    console.log('📊 Event Summary:');
    console.log(`   - Tickets Sold (from BMS): ${eventSummary.ticketSold}`);
    console.log(`   - Total Offloaded Qty: ${eventSummary.totalOffLoadedQty}\n`);
    
    // Get registration count
    const registrationCount = await db.collection('registrationDetails').countDocuments();
    console.log(`📋 Unique Registrations in DB: ${registrationCount}\n`);
    
    // Calculate total tickets from registrations
    const registrations = await db.collection('registrationDetails').find({}).toArray();
    let totalTickets = 0;
    let multiTicketRegistrations = 0;
    
    for (const reg of registrations) {
      const qty = reg.Ticket_Qty || reg.quantity || 1;
      totalTickets += qty;
      if (qty > 1) {
        multiTicketRegistrations++;
      }
    }
    
    console.log('🎫 Ticket Analysis:');
    console.log(`   - Total Tickets (sum of quantities): ${totalTickets}`);
    console.log(`   - Registrations with multiple tickets: ${multiTicketRegistrations}`);
    console.log(`   - Average tickets per registration: ${(totalTickets / registrationCount).toFixed(2)}\n`);
    
    console.log('🔍 Discrepancy Analysis:');
    const difference = eventSummary.ticketSold - totalTickets;
    console.log(`   - BMS Event Summary: ${eventSummary.ticketSold} tickets`);
    console.log(`   - Calculated from Registrations: ${totalTickets} tickets`);
    console.log(`   - Difference: ${difference} tickets\n`);
    
    if (Math.abs(difference) === 0) {
      console.log('✅ Perfect match! No discrepancy.');
    } else if (Math.abs(difference) < 20) {
      console.log('⚠️  Small discrepancy detected (< 20 tickets)');
      console.log('   Likely due to:');
      console.log('   - Registrations with invalid data (skipped by scraper)');
      console.log('   - Duplicate transaction IDs');
      console.log('   - Missing customer names');
    } else {
      console.log('❌ Large discrepancy detected!');
      console.log('   This requires investigation.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n✅ Connection closed');
  }
}

verifyTicketCount();

