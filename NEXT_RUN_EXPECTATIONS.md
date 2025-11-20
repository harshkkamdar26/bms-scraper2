# Expected Output for Next Scraper Run

## What to Look For

### ✅ Success Indicators

**1. Dynamic Session Detection:**
```
🎭 Selecting event to load sessions...
📅 Available sessions: [
  {
    "value": "10364",
    "text": "Dec  6 2025  3:00PM"
  }
]
📅 Using session: Dec  6 2025  3:00PM
```

**2. Extended Wait Time:**
```
⏳ Waiting for response (up to 90 seconds for large datasets)...
✅ Got POST response from server
```

**3. Successful Data Retrieval:**
```
✅ Registration report data received
📄 Response text length: [large number, e.g., 500000+]
📊 Total rows processed: 2735+
🎫 Ticket holders parsed: 2735+
```

**4. Database Update:**
```
✅ Saved 1 events to eventSummaries collection
✅ Saved 2735+ ticket holders to registrationdetails collection
📊 Events: 1, Ticket Holders: 2735+
```

**5. Dashboard Stats:**
```
📊 Summary:
   Total Registrations: 2735+
   Mumukshus: 826+ (30.20%)
   Non-Mumukshus: 1909+ (69.80%)
```

### ❌ If Still Failing

**Look for these in logs:**

1. **Wrong session selected?**
   - Check the "📅 Using session:" line
   - Should match what BMS form shows

2. **Still timing out?**
   - Look for "❌ Error waiting for response"
   - Check if it's hitting the 90-second timeout
   - May need to increase further if BMS is very slow

3. **Form page returned?**
   - Check for "⚠️ Got the form page instead of results"
   - Indicates form submission still not working
   - Might need to inspect form structure changes

## Troubleshooting Commands

If the issue persists, add this to the workflow to debug:

```bash
# After the scraper runs, check what files were created
ls -lah debug-*.html

# If debug files exist, upload them as artifacts to inspect
```

## Expected Timeline

- **Event Summary**: ~3-5 seconds
- **Registration Details**: ~30-60 seconds (with large dataset)
- **Database Save**: ~5-10 seconds
- **Stats Calculation**: ~3-5 seconds
- **Total**: ~45-80 seconds

## Next Steps After Successful Run

1. ✅ Verify dashboard shows updated registration count
2. ✅ Check that Nov 20 registrations (49+) appear in charts
3. ✅ Confirm mumukshu matching is working correctly
4. ✅ Validate no duplicate entries

---
**Created:** November 20, 2025
**Issue:** Registration timeout causing 0 ticket holders
**Fix:** Dynamic session detection + extended timeouts

