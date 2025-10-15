# BMS Form Version Changes

## Overview
The BMS registration form changed on **October 9, 2025** when switching from Early Bird Referral phase to General Access phase.

## Form Versions

### OLD FORM (Until Oct 8, 2025 23:59:59)
**Phase**: Early Bird Referral Access

**Name Fields**:
- `first_name` (Column 20)
- `last_name` (Column 21)
- `full_name` (Column 45) - **EMPTY**

**Referral Fields**:
- `name_1` to `name_5`
- `mobile_number_1` to `mobile_number_5`
- `email_id_1` to `email_id_5`

**Example**:
```
first_name: "Disha"
last_name: "Daga"
full_name: ""
```

### NEW FORM (From Oct 9, 2025 00:00:00)
**Phase**: General Access

**Name Fields**:
- `first_name` (Column 20) - **EMPTY**
- `last_name` (Column 21) - **EMPTY**
- `full_name` (Column 45) - **POPULATED**

**Referral Fields**: 
- Not available (removed from form)

**Example**:
```
first_name: ""
last_name: ""
full_name: "Diva Sheth"
```

## Scraper Updates

### Name Parsing Logic
```javascript
// 1. Try to get first_name and last_name (old form)
let firstName = $(cells[20]).text().trim();
let lastName = $(cells[21]).text().trim();
const fullNameField = $(cells[45]).text().trim();

// 2. If empty, use full_name and split it (new form)
if ((!firstName && !lastName) && fullNameField) {
  const nameParts = fullNameField.split(' ');
  firstName = nameParts[0];
  lastName = nameParts.slice(1).join(' ') || firstName;
}

// 3. Fallback: Use transaction ID as identifier
if (!customerName || customerName.length === 0) {
  firstName = `Guest_${transId.substring(0, 8)}`;
  lastName = '';
}
```

### Key Features
✅ **No rows skipped** - All registrations are saved regardless of name format
✅ **Backward compatible** - Handles both old and new form versions
✅ **Fallback identifier** - Uses transaction ID if no name is available

## Dashboard Updates

### Referral Distribution Chart
**Important**: Only shows data from **Early Bird phase** (before Oct 9, 2025)

```typescript
// Cutoff date for referral data
const referralCutoffDate = '2025-10-09';

// Skip registrations from General Access phase
if (regDate && regDate >= referralCutoffDate) {
  continue; // No referral fields in new form
}
```

**Why?**
- New form doesn't have referral fields
- Including post-Oct 9 data would skew the chart (all would show "0 invitees")
- Only Early Bird registrations had the ability to refer others

## Expected Results

### Before Fix (Missing 19 registrations)
- Registrations with empty `first_name` and `last_name` were skipped
- 1316 out of 1335 saved

### After Fix (All registrations saved)
- Scraper checks `full_name` if `first_name`/`last_name` are empty
- Falls back to transaction ID if needed
- **Expected: 1335 registrations** (matching BMS Event Summary)

## Testing

Run the scraper and check the output:
```
=== REGISTRATION PARSING SUMMARY ===
📊 Total rows processed: 1335
✅ Successfully parsed: 1335
⚠️ Skipped rows: 0
🔍 Unique Trans_Ids: 1335
===================================
```

Should now be **0 skipped rows**!

## Notes
- The `customerName` field will still be populated correctly for both form versions
- `first_name` and `last_name` are properly extracted from `full_name` when needed
- Old referral data remains valid and visible in the dashboard
- New registrations (post-Oct 9) won't affect referral statistics

