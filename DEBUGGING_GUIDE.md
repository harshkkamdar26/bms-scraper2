# BMS Scraper Debugging Guide

## Current Status

**Discrepancy Detected:**
- BMS Event Summary: **1335 tickets sold**
- Scraper Database: **1316 registrations**
- **Missing: 19 registrations (1.4%)**

## Enhanced Debugging Features

The scraper now includes detailed logging that will help identify why registrations are being skipped.

### New Debug Output

When you run the scraper (via GitHub Actions), you'll see:

```
=== REGISTRATION PARSING SUMMARY ===
📊 Total rows processed: 1335
✅ Successfully parsed: 1316
⚠️ Skipped rows: 19
🔍 Unique Trans_Ids: 1316
===================================
```

### What Gets Logged

1. **Row Count**: Total rows found in the data table
2. **Header Location**: Which row contains the headers
3. **Individual Skip Reasons**:
   - "Skipped - only X cells (need 45+)" - Incomplete rows
   - "Duplicate Trans_Id found: XXXXX" - Duplicate transactions
   - "Skipped - Invalid name: 'XX'" - Names too short or empty
4. **Sample Successful Registrations**: Shows first 10 and every 100th registration

## How to Debug

### Option 1: Run via GitHub Actions
1. Go to your repository's Actions tab
2. Find the "scrape" workflow
3. Trigger a manual run
4. Check the logs for the detailed breakdown

### Option 2: Run Locally
```bash
cd bms-scrapper
npm run scrape 2>&1 | tee scrape-debug.log
```

The output will be saved to `scrape-debug.log` for analysis.

### Option 3: Verify Ticket Count
```bash
cd bms-scrapper
node verify-ticket-count.js
```

This shows:
- Event Summary ticket count
- Registration count in database
- Total tickets (sum of quantities)
- Multi-ticket registrations
- Discrepancy analysis

## Common Issues & Solutions

### Issue: Duplicate Trans_IDs
**Symptom**: Multiple registrations with same transaction ID
**Solution**: The scraper now automatically deduplicates using a Set
**Expected**: Should not cause data loss

### Issue: Invalid Names
**Symptom**: Names are empty, "N/A", or very short
**Solution**: Filter applied - names must be > 2 characters
**Action**: Check if BMS has registrations with invalid names

### Issue: Incomplete Rows
**Symptom**: Table rows don't have all 45 columns
**Solution**: Rows are skipped automatically
**Action**: Check BMS export format - may need to adjust column count

### Issue: Parsing Errors
**Symptom**: Exception thrown during row parsing
**Solution**: Error is logged and row is skipped
**Action**: Check specific row data in debug logs

## Next Steps

1. **Run the scraper via GitHub Actions** to get the detailed log
2. **Review the skip reasons** in the console output
3. **Check the 19 missing registrations**:
   - Are they valid registrations in BMS?
   - Do they have proper customer names?
   - Are there duplicate transaction IDs?
4. **Adjust scraper logic** if needed based on findings

## Expected Behavior

A small discrepancy (< 20 registrations, ~1.4%) is generally acceptable if it's due to:
- Invalid/test data in BMS
- Duplicate bookings
- Cancelled/refunded tickets that still appear in the summary

If the missing registrations are valid, we'll need to adjust the scraper's filtering logic.

