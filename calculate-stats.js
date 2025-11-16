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
    const [registrations, arpitMembers, previousParticipants, eventSummary] = await Promise.all([
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
      db.collection('previousyearparticipants').find({
        years: { $exists: true, $ne: [] }
      }, {
        projection: {
          phone: 1,
          fullName: 1,
          years: 1,
          age: 1
        }
      }).toArray(),
      db.collection('eventSummaries').findOne({}, {
        sort: { fetchedAt: -1 },
        projection: { totalOffLoadedQty: 1 }
      })
    ]);
    
    console.log(`   Registrations: ${registrations.length}`);
    console.log(`   Arpit Members: ${arpitMembers.length}`);
    console.log(`   Previous Participants: ${previousParticipants.length}`);
    
    // Get total tickets from event summary (totalOffLoadedQty = actual tickets distributed)
    const totalOffLoadedQty = eventSummary?.totalOffLoadedQty || registrations.length;
    console.log(`   Total Offloaded Qty (Actual Tickets): ${totalOffLoadedQty}`);
    
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
        
        // Use match if phone/email confirmed OR if it's the only name match
        // This EXACTLY matches the Arpit Group API logic (line 268)
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
    
    // Build a Set of registered Arpit member IDs (to avoid double counting)
    const registeredArpitMembers = new Set();
    for (const member of arpitMemberRegistrations.values()) {
      const memberId = `${member.fullName}-${member.mobileNumber}`.toLowerCase();
      registeredArpitMembers.add(memberId);
    }
    
    // Count group totals
    for (const member of arpitMembers) {
      const group = member.group;
      if (group && group in groupRegistrationStats) {
        const memberId = `${member.fullName}-${member.mobileNumber}`.toLowerCase();
        const isRegistered = registeredArpitMembers.has(memberId);
        if (isRegistered) {
          groupRegistrationStats[group].registered++;
        } else {
          groupRegistrationStats[group].notRegistered++;
        }
      }
    }
    
    // Process each registration - COUNT BY PEOPLE (unique registrations) not by tickets
    // This matches the Arpit Group API logic which counts unique people
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
      
      // Update counters - count by PEOPLE (1 per registration) to match Arpit Group API
      if (isMumukshu) {
        mumukshus++; // Count 1 person (not their ticket quantity)
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
    
    // Use registration count as total (count by PEOPLE not tickets)
    // This matches how Arpit Group API counts (816 people, not 890 tickets)
    const total = registrations.length;
    
    // Non-mumukshus is already calculated correctly from the loop above
    // nonMumukshus = total - mumukshus (already done by counting in the loop)
    
    // Calculate percentages
    const mumukshusPercentage = total > 0 ? ((mumukshus / total) * 100).toFixed(2) : '0';
    const nonMumukshusPercentage = total > 0 ? ((nonMumukshus / total) * 100).toFixed(2) : '0';
    const firstTimersPercentage = total > 0 ? ((firstTimers / total) * 100).toFixed(2) : '0';
    const returningPercentage = total > 0 ? ((returningParticipants / total) * 100).toFixed(2) : '0';
    
    const firstTimersAbove40Percentage = firstTimers > 0 ? ((firstTimersAbove40 / firstTimers) * 100).toFixed(2) : '0';
    const firstTimersUnder40Percentage = firstTimers > 0 ? ((firstTimersUnder40 / firstTimers) * 100).toFixed(2) : '0';
    const firstTimersUnknownAgePercentage = firstTimers > 0 ? ((firstTimersUnknownAge / firstTimers) * 100).toFixed(2) : '0';
    
    // Calculate registration trends (group by date)
    console.log('📅 Calculating registration trends...');
    const parseTransDate = (transDate) => {
      if (!transDate || typeof transDate !== 'string') return null;
      try {
        const datePart = transDate.split(' ')[0];
        const [day, month, year] = datePart.split('-');
        return `${year}-${month}-${day}`;
      } catch {
        return null;
      }
    };
    
    const groupedData = {};
    registrations.forEach(reg => {
      const dateStr = parseTransDate(reg.Trans_Date);
      if (dateStr) {
        if (!groupedData[dateStr]) {
          groupedData[dateStr] = { count: 0 };
        }
        const ticketQty = reg.Ticket_Qty || 1;
        groupedData[dateStr].count += ticketQty;
      }
    });
    
    const allTimeRegistrations = Object.entries(groupedData)
      .map(([date, data]) => ({
        _id: date,
        count: data.count
      }))
      .sort((a, b) => a._id.localeCompare(b._id));
    
    // Calculate referral stats (only for registrations before Oct 9)
    console.log('👥 Calculating referral stats...');
    const referralCutoffDate = '2025-10-09';
    const referralStats = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    
    for (const reg of registrations) {
      const regDate = parseTransDate(reg.Trans_Date);
      
      if (regDate && regDate >= referralCutoffDate) {
        continue;
      }
      
      let inviteeCount = 0;
      
      for (let i = 1; i <= 5; i++) {
        const nameKey = `name_${i}`;
        const mobileKey = `mobile_number_${i}`;
        const emailKey = `email_id_${i}`;
        
        if ((reg[nameKey] && reg[nameKey] !== '') || 
            (reg[mobileKey] && reg[mobileKey] !== '') || 
            (reg[emailKey] && reg[emailKey] !== '')) {
          inviteeCount++;
        }
      }
      
      referralStats[inviteeCount]++;
    }
    
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
      groupRegistrationStats,
      registrationTrends: {
        allTime: allTimeRegistrations
      },
      referralStats
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

