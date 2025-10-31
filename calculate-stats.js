require('dotenv').config();
const { MongoClient } = require('mongodb');

/**
 * Calculate all dashboard statistics
 * This runs after scraping new data to pre-calculate stats
 * so the dashboard loads instantly
 */
async function calculateDashboardStats() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const startTime = Date.now();
    
    // Fetch all data in parallel
    console.log('📊 Fetching data...');
    const [registrations, arpitMembers, previousParticipants] = await Promise.all([
      db.collection('registrationDetails').find({}, {
        projection: {
          customerName: 1,
          phone: 1,
          primaryPhoneNo: 1,
          email: 1,
          age: 1,
          registrationId: 1,
          Ticket_Qty: 1,
          Trans_Date: 1
        }
      }).toArray(),
      db.collection('arpitGroupMembers').find({}, {
        projection: {
          fullName: 1,
          mobileNumber: 1,
          alternateMobileNumber: 1,
          email: 1,
          age: 1,
          group: 1
        }
      }).toArray(),
      db.collection('previousYearParticipants').find({
        years: { $in: [2019, 2020, 2021, 2022, 2023, 2024] }
      }, {
        projection: {
          phone: 1,
          fullName: 1,
          years: 1,
          age: 1
        }
      }).toArray()
    ]);
    
    console.log(`   Registrations: ${registrations.length}`);
    console.log(`   Arpit Members: ${arpitMembers.length}`);
    console.log(`   Previous Participants: ${previousParticipants.length}`);
    
    // Build Arpit member registration map
    console.log('🔍 Matching Arpit members...');
    const arpitMemberRegistrations = new Map();
    const usedRegistrationIds = new Set();
    
    for (const member of arpitMembers) {
      const memberNameNormalized = member.fullName?.toLowerCase().trim();
      const memberPhone = member.mobileNumber?.replace(/[\s\-\+]/g, '').replace(/^91/, '');
      const memberEmailNormalized = member.email?.toLowerCase().trim();
      const phone10 = memberPhone && memberPhone.length >= 10 ? memberPhone.slice(-10) : null;
      
      // Find ALL registrations with matching name
      const nameMatchingRegs = registrations.filter(reg => {
        if (usedRegistrationIds.has(reg.registrationId)) return false;
        const regNameNormalized = reg.customerName?.toLowerCase().trim();
        return memberNameNormalized && regNameNormalized && memberNameNormalized === regNameNormalized;
      });
      
      let matchedReg = null;
      
      if (nameMatchingRegs.length > 0) {
        // Try to find best match using phone/email
        let bestMatch = null;
        let bestScore = 0;
        
        for (const reg of nameMatchingRegs) {
          let score = 0;
          const regPhone = (reg.phone || reg.primaryPhoneNo || '').replace(/[\s\-\+]/g, '').replace(/^91/, '');
          const regPhone10 = regPhone && regPhone.length >= 10 ? regPhone.slice(-10) : null;
          const regEmailNormalized = reg.email?.toLowerCase().trim();
          
          if (phone10 && regPhone10 && phone10 === regPhone10) {
            score += 3;
          }
          if (memberEmailNormalized && regEmailNormalized && memberEmailNormalized === regEmailNormalized) {
            score += 2;
          }
          
          if (score > bestScore) {
            bestScore = score;
            bestMatch = reg;
          }
        }
        
        // Use match ONLY if phone or email confirmed (score > 0) OR if it's the only name match
        if (bestMatch && (bestScore > 0 || nameMatchingRegs.length === 1)) {
          matchedReg = bestMatch;
        }
      }
      
      // If no name match, try phone
      if (!matchedReg && phone10) {
        matchedReg = registrations.find(reg => {
          if (usedRegistrationIds.has(reg.registrationId)) return false;
          const regPhone = (reg.phone || reg.primaryPhoneNo || '').replace(/[\s\-\+]/g, '').replace(/^91/, '');
          const regPhone10 = regPhone && regPhone.length >= 10 ? regPhone.slice(-10) : null;
          return regPhone10 && phone10 === regPhone10;
        });
      }
      
      // If no name or phone match, try email
      if (!matchedReg && memberEmailNormalized) {
        matchedReg = registrations.find(reg => {
          if (usedRegistrationIds.has(reg.registrationId)) return false;
          const regEmailNormalized = reg.email?.toLowerCase().trim();
          return regEmailNormalized && memberEmailNormalized === regEmailNormalized;
        });
      }
      
      if (matchedReg) {
        arpitMemberRegistrations.set(matchedReg.registrationId, member);
        usedRegistrationIds.add(matchedReg.registrationId);
      }
    }
    
    console.log(`   Matched ${arpitMemberRegistrations.size} Arpit members to registrations`);
    
    // Build previous participants phone map
    console.log('🔍 Building previous participants map...');
    const previousPhoneMap = new Map();
    previousParticipants.forEach(participant => {
      let phone = participant.phone?.replace(/[\s\-\+]/g, '');
      if (phone?.startsWith('91') && phone.length > 10) {
        phone = phone.substring(2);
      }
      const phone10 = phone && phone.length >= 10 ? phone.slice(-10) : null;
      if (phone10) {
        previousPhoneMap.set(phone10, participant);
      }
    });
    
    // Calculate statistics
    console.log('📈 Calculating statistics...');
    let mumukshus = 0;
    let nonMumukshus = 0;
    let firstTimers = 0;
    let returningParticipants = 0;
    let firstTimersAbove40 = 0;
    let firstTimersUnder40 = 0;
    let firstTimersUnknownAge = 0;
    
    const groupBreakdown = { YG: 0, SG: 0, JG: 0, HG: 0 };
    const groupRegistrationStats = {
      YG: { registered: 0, notRegistered: 0 },
      SG: { registered: 0, notRegistered: 0 },
      JG: { registered: 0, notRegistered: 0 },
      HG: { registered: 0, notRegistered: 0 }
    };
    
    // Count group totals
    for (const member of arpitMembers) {
      const group = member.group;
      if (group && group in groupRegistrationStats) {
        const isRegistered = Array.from(arpitMemberRegistrations.values()).some(m => m.fullName === member.fullName);
        if (isRegistered) {
          groupRegistrationStats[group].registered++;
        } else {
          groupRegistrationStats[group].notRegistered++;
        }
      }
    }
    
    // Process each registration
    registrations.forEach(registration => {
      const regPhone = registration.phone || registration.primaryPhoneNo || '';
      const age = parseInt(registration.age) || 0;
      
      // Check if mumukshu
      const isMumukshu = arpitMemberRegistrations.has(registration.registrationId);
      const arpitMember = isMumukshu ? arpitMemberRegistrations.get(registration.registrationId) : null;
      
      // Check if first timer
      let phone = regPhone?.replace(/[\s\-\+]/g, '');
      if (phone?.startsWith('91') && phone.length > 10) {
        phone = phone.substring(2);
      }
      const phone10 = phone && phone.length >= 10 ? phone.slice(-10) : null;
      const isReturning = phone10 && previousPhoneMap.has(phone10);
      
      // Update counters
      if (isMumukshu) {
        mumukshus++;
        if (arpitMember && arpitMember.group && arpitMember.group in groupBreakdown) {
          groupBreakdown[arpitMember.group]++;
        }
      } else {
        nonMumukshus++;
      }
      
      if (isReturning) {
        returningParticipants++;
      } else {
        firstTimers++;
        if (age > 0) {
          if (age >= 40) {
            firstTimersAbove40++;
          } else {
            firstTimersUnder40++;
          }
        } else {
          firstTimersUnknownAge++;
        }
      }
    });
    
    const total = registrations.length;
    
    // Calculate percentages
    const mumukshusPercentage = total > 0 ? ((mumukshus / total) * 100).toFixed(2) : '0';
    const nonMumukshusPercentage = total > 0 ? ((nonMumukshus / total) * 100).toFixed(2) : '0';
    const firstTimersPercentage = total > 0 ? ((firstTimers / total) * 100).toFixed(2) : '0';
    const returningPercentage = total > 0 ? ((returningParticipants / total) * 100).toFixed(2) : '0';
    
    const firstTimersAbove40Percentage = firstTimers > 0 ? ((firstTimersAbove40 / firstTimers) * 100).toFixed(2) : '0';
    const firstTimersUnder40Percentage = firstTimers > 0 ? ((firstTimersUnder40 / firstTimers) * 100).toFixed(2) : '0';
    const firstTimersUnknownAgePercentage = firstTimers > 0 ? ((firstTimersUnknownAge / firstTimers) * 100).toFixed(2) : '0';
    
    // Build stats object
    const stats = {
      calculatedAt: new Date(),
      overview: {
        totalRegistrations: total,
        dataQuality: {
          totalArpitMembers: arpitMembers.length,
          totalPreviousParticipants: previousParticipants.length,
          yearsConsidered: [2019, 2020, 2021, 2022, 2023, 2024]
        }
      },
      mumukshusAnalysis: {
        summary: {
          mumukshus,
          nonMumukshus,
          mumukshusPercentage: parseFloat(mumukshusPercentage),
          nonMumukshusPercentage: parseFloat(nonMumukshusPercentage)
        },
        groupBreakdown
      },
      firstTimerAnalysis: {
        summary: {
          firstTimers,
          returningParticipants,
          firstTimersPercentage: parseFloat(firstTimersPercentage),
          returningPercentage: parseFloat(returningPercentage)
        },
        ageBreakdown: {
          above40: {
            count: firstTimersAbove40,
            percentage: parseFloat(firstTimersAbove40Percentage)
          },
          under40: {
            count: firstTimersUnder40,
            percentage: parseFloat(firstTimersUnder40Percentage)
          },
          unknownAge: {
            count: firstTimersUnknownAge,
            percentage: parseFloat(firstTimersUnknownAgePercentage)
          }
        }
      },
      arpitRegistrationStats: {
        registered: arpitMemberRegistrations.size,
        notRegistered: arpitMembers.length - arpitMemberRegistrations.size
      },
      groupRegistrationStats
    };
    
    // Save to database
    console.log('💾 Saving stats to database...');
    await db.collection('dashboardStats').deleteMany({}); // Clear old stats
    await db.collection('dashboardStats').insertOne(stats);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Stats calculated and saved in ${duration}ms`);
    console.log('\n📊 Summary:');
    console.log(`   Total Registrations: ${total}`);
    console.log(`   Mumukshus: ${mumukshus} (${mumukshusPercentage}%)`);
    console.log(`   Non-Mumukshus: ${nonMumukshus} (${nonMumukshusPercentage}%)`);
    console.log(`   First Timers: ${firstTimers} (${firstTimersPercentage}%)`);
    console.log(`   Returning: ${returningParticipants} (${returningPercentage}%)`);
    
    return stats;
    
  } catch (error) {
    console.error('❌ Error calculating stats:', error);
    throw error;
  } finally {
    await client.close();
  }
}

// Run if called directly
if (require.main === module) {
  calculateDashboardStats()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { calculateDashboardStats };

