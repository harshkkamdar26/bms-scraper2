const { google } = require('googleapis');
const mongoose = require('mongoose');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

// Google Sheets Configuration
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL || '';
const BULK_BOOKINGS_TAB_NAME = process.env.BULK_BOOKINGS_TAB_NAME || 'Bulk Bookings';
const BULK_PARTICIPANTS_TAB_NAME = process.env.BULK_PARTICIPANTS_TAB_NAME || 'Participants Details';

// Extract Sheet ID from URL
const extractSheetId = (url) => {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
};

// MongoDB Schemas
const BulkBookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true, index: true },
  spocName: { type: String, required: true, index: true },
  spocPhone: { type: String, required: true, index: true },
  spocEmail: { type: String },
  numberOfTickets: { type: Number, required: true },
  ratePerTicket: { type: Number },
  totalAmount: { type: Number },
  bookingType: { type: String, required: true, enum: ['bulk', 'b2b'], default: 'bulk', index: true },
  paymentReceived: { type: Boolean, required: true, default: false, index: true },
  passesGiven: { type: Boolean, required: true, default: false, index: true },
  bookingDate: { type: Date, required: true, default: Date.now, index: true },
  eventName: { type: String, required: true, default: 'Global Youth Festival 2025' },
  notes: { type: String },
}, {
  timestamps: true,
  collection: 'bulkBookings'
});

const BulkBookingParticipantSchema = new mongoose.Schema({
  registrationId: { type: String, required: true, unique: true, index: true },
  bulkBookingId: { type: String, required: true, index: true },
  spocName: { type: String, required: true, index: true },
  spocPhone: { type: String, required: true, index: true },
  customerName: { type: String, required: true, index: true },
  phone: { type: String, required: true, index: true },
  email: { type: String, required: true, index: true },
  age: { type: Number },
  gender: { type: String },
  pincode: { type: String },
  ticketType: { type: String, required: true, enum: ['Bulk Booking', 'B2B Booking'], index: true },
  quantity: { type: Number, required: true, default: 1 },
  amount: { type: Number },
  paymentStatus: { type: String, required: true, default: 'Confirmed', index: true },
  bookingReference: { type: String, required: true, index: true },
  registrationDate: { type: Date, required: true, default: Date.now, index: true },
  eventName: { type: String, required: true, default: 'Global Youth Festival 2025' },
  showDate: { type: Date, required: true, default: () => new Date('2025-12-06T14:00:00') },
  dataSource: { type: String, required: true, enum: ['bulk_booking', 'b2b_booking'], default: 'bulk_booking', index: true },
}, {
  timestamps: true,
  collection: 'bulkBookingParticipants'
});

// Helper function to normalize boolean values
const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    return normalized === 'yes' || normalized === 'true' || normalized === '1';
  }
  return false;
};

// Helper function to generate booking ID
const generateBookingId = (spocPhone, spocName) => {
  const cleanPhone = spocPhone.replace(/\D/g, '');
  const nameHash = spocName.toLowerCase().replace(/\s+/g, '');
  return `BULK-${cleanPhone}-${nameHash.substring(0, 5)}`;
};

// Helper function to generate registration ID
const generateRegistrationId = (bulkBookingId, customerName, phone) => {
  const cleanPhone = phone.replace(/\D/g, '');
  const nameHash = customerName.toLowerCase().replace(/\s+/g, '');
  return `${bulkBookingId}-${cleanPhone}-${nameHash.substring(0, 5)}`;
};

async function syncBulkBookings() {
  let mongoConnection;
  
  try {
    console.log('🚀 Starting Bulk Booking Sync...');
    console.log(`📊 Sheet URL: ${GOOGLE_SHEET_URL}`);
    console.log(`📋 Bulk Bookings Tab: "${BULK_BOOKINGS_TAB_NAME}"`);
    console.log(`👥 Participants Tab: "${BULK_PARTICIPANTS_TAB_NAME}"`);

    // Validate environment variables
    if (!GOOGLE_SHEET_URL) {
      throw new Error('GOOGLE_SHEET_URL is not set');
    }
    if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
      throw new Error('Google Sheets credentials are not set');
    }
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not set');
    }

    const SHEET_ID = extractSheetId(GOOGLE_SHEET_URL);
    if (!SHEET_ID) {
      throw new Error('Invalid Google Sheet URL');
    }

    console.log(`🔑 Sheet ID: ${SHEET_ID}`);

    // Initialize Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    mongoConnection = await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected');

    const BulkBooking = mongoose.models.BulkBooking || mongoose.model('BulkBooking', BulkBookingSchema);
    const BulkBookingParticipant = mongoose.models.BulkBookingParticipant || mongoose.model('BulkBookingParticipant', BulkBookingParticipantSchema);

    // Fetch Bulk Bookings data
    console.log(`\n📥 Fetching "${BULK_BOOKINGS_TAB_NAME}" data...`);
    const bulkBookingsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${BULK_BOOKINGS_TAB_NAME}!A:J`,
    });

    const bulkBookingsRows = bulkBookingsResponse.data.values || [];
    console.log(`📊 Found ${bulkBookingsRows.length} rows in Bulk Bookings tab`);

    if (bulkBookingsRows.length === 0) {
      console.log('⚠️  No data found in Bulk Bookings tab');
      return;
    }

    // Process Bulk Bookings (skip header row)
    const bulkBookingsData = [];
    for (let i = 1; i < bulkBookingsRows.length; i++) {
      const row = bulkBookingsRows[i];
      
      // Skip empty rows or example rows
      if (!row[0] || row[0].toLowerCase().includes('eg:') || row[0].trim() === '') {
        continue;
      }

      const spocName = row[0]?.trim();
      const spocPhone = row[1]?.trim();
      const spocEmail = row[2]?.trim();
      const numberOfTickets = parseInt(row[3]) || 0;
      const ratePerTicket = parseFloat(row[4]) || 0;
      const totalAmount = parseFloat(row[5]) || 0;
      const paymentReceived = normalizeBoolean(row[6]);
      const passesGiven = normalizeBoolean(row[8]);

      // Skip if no SPOC name or phone
      if (!spocName || !spocPhone || numberOfTickets === 0) {
        console.log(`⚠️  Skipping row ${i + 1}: Missing required data`);
        continue;
      }

      const bookingId = generateBookingId(spocPhone, spocName);

      // Check if this SPOC already has a booking - aggregate if so
      const existingBooking = bulkBookingsData.find(b => b.bookingId === bookingId);
      
      if (existingBooking) {
        // Aggregate: Add to existing booking
        existingBooking.numberOfTickets += numberOfTickets;
        existingBooking.totalAmount += totalAmount;
        // Use the latest payment/passes status
        existingBooking.paymentReceived = paymentReceived || existingBooking.paymentReceived;
        existingBooking.passesGiven = passesGiven || existingBooking.passesGiven;
        // Update rate to be the average
        existingBooking.ratePerTicket = Math.round(existingBooking.totalAmount / existingBooking.numberOfTickets);
        console.log(`➕ Aggregated booking for ${spocName}: +${numberOfTickets} tickets (total: ${existingBooking.numberOfTickets})`);
      } else {
        // New booking
        bulkBookingsData.push({
          bookingId,
          spocName,
          spocPhone,
          spocEmail,
          numberOfTickets,
          ratePerTicket,
          totalAmount,
          bookingType: 'bulk', // Default to bulk, can be changed manually if needed
          paymentReceived,
          passesGiven,
          bookingDate: new Date(),
          eventName: 'Global Youth Festival 2025',
        });
      }
    }

    console.log(`✅ Processed ${bulkBookingsData.length} bulk bookings`);

    // Upsert Bulk Bookings
    let bulkBookingsUpserted = 0;
    for (const booking of bulkBookingsData) {
      await BulkBooking.findOneAndUpdate(
        { bookingId: booking.bookingId },
        booking,
        { upsert: true, new: true }
      );
      bulkBookingsUpserted++;
    }

    console.log(`✅ Upserted ${bulkBookingsUpserted} bulk bookings to database`);

    // Fetch Participants data
    console.log(`\n📥 Fetching "${BULK_PARTICIPANTS_TAB_NAME}" data...`);
    const participantsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${BULK_PARTICIPANTS_TAB_NAME}!A:H`,
    });

    const participantsRows = participantsResponse.data.values || [];
    console.log(`📊 Found ${participantsRows.length} rows in Participants tab`);

    if (participantsRows.length === 0) {
      console.log('⚠️  No data found in Participants tab');
      return;
    }

    // Process Participants (skip header row)
    const participantsData = [];
    for (let i = 1; i < participantsRows.length; i++) {
      const row = participantsRows[i];
      
      // Skip empty rows or example rows
      if (!row[0] || row[0].toLowerCase().includes('eg:') || row[0].trim() === '') {
        continue;
      }

      const customerName = row[0]?.trim();
      const phone = row[1]?.trim();
      const email = row[2]?.trim();
      const age = parseInt(row[3]) || null;
      const gender = row[4]?.trim();
      const pincode = row[5]?.trim();
      const spocName = row[6]?.trim();
      const spocPhone = row[7]?.trim();

      // Skip if missing required fields
      if (!customerName || !phone || !email || !spocName || !spocPhone) {
        console.log(`⚠️  Skipping participant row ${i + 1}: Missing required data`);
        continue;
      }

      const bulkBookingId = generateBookingId(spocPhone, spocName);
      const registrationId = generateRegistrationId(bulkBookingId, customerName, phone);

      // Find the parent booking to get rate per ticket
      const parentBooking = bulkBookingsData.find(b => b.bookingId === bulkBookingId);
      const amount = parentBooking ? parentBooking.ratePerTicket : 0;

      participantsData.push({
        registrationId,
        bulkBookingId,
        spocName,
        spocPhone,
        customerName,
        phone,
        email,
        age,
        gender,
        pincode,
        ticketType: 'Bulk Booking',
        quantity: 1,
        amount,
        paymentStatus: 'Confirmed',
        bookingReference: bulkBookingId,
        registrationDate: new Date(),
        eventName: 'Global Youth Festival 2025',
        showDate: new Date('2025-12-06T14:00:00'),
        dataSource: 'bulk_booking',
      });
    }

    console.log(`✅ Processed ${participantsData.length} participants`);

    // Upsert Participants
    let participantsUpserted = 0;
    for (const participant of participantsData) {
      await BulkBookingParticipant.findOneAndUpdate(
        { registrationId: participant.registrationId },
        participant,
        { upsert: true, new: true }
      );
      participantsUpserted++;
    }

    console.log(`✅ Upserted ${participantsUpserted} participants to database`);

    console.log('\n🎉 Sync completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Bulk Bookings: ${bulkBookingsUpserted}`);
    console.log(`   - Participants: ${participantsUpserted}`);

  } catch (error) {
    console.error('❌ Error during sync:', error.message);
    console.error(error);
    throw error;
  } finally {
    if (mongoConnection) {
      await mongoose.disconnect();
      console.log('🔌 MongoDB disconnected');
    }
  }
}

// Run the sync
if (require.main === module) {
  syncBulkBookings()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { syncBulkBookings };

