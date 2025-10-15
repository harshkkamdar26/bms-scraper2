# GitHub Actions Setup for BMS Scraper

## 🚀 Quick Setup Guide

### 1. Repository Secrets Configuration

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add these **required secrets**:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/bms_dashboard
BMS_USERNAME=Global.youth2025
BMS_PASSWORD=your_bms_password
```

### 2. Enable GitHub Actions

1. Go to your repository → Actions tab
2. If prompted, click "I understand my workflows, go ahead and enable them"
3. The scraper will now run automatically every 30 minutes

### 3. Manual Trigger (Optional)

- Go to Actions → BMS Scraper → Run workflow
- Click "Run workflow" to trigger manually

## ⚡ Performance Optimizations Implemented

### Speed Improvements:
- **Aggressive resource blocking**: Images, CSS, fonts, analytics blocked
- **Parallel operations**: Login and data extraction run simultaneously  
- **Reduced timeouts**: 10s navigation, 5s element waits (vs 30s+ before)
- **Bulk MongoDB operations**: Batch inserts instead of individual saves
- **Minimal DOM waiting**: Uses `domcontentloaded` instead of `networkidle`
- **Optimized browser args**: Memory and CPU optimizations for CI

### Expected Performance:
- **Before**: 8-15 minutes per run
- **After**: 2-5 minutes per run (60-70% faster)

## 📊 Monitoring & Debugging

### View Logs:
1. Go to Actions → Latest workflow run
2. Click on "scrape" job to see detailed logs
3. Performance timing is logged for each step

### Debug Failed Runs:
- Failed runs automatically upload debug HTML files
- Download artifacts from the failed run to investigate
- Check the "Upload debug files on failure" step

### Timeout Protection:
- Scraper automatically times out after 5 minutes
- GitHub Actions job times out after 15 minutes
- Prevents hanging processes consuming resources

## 🔄 Schedule Details

```yaml
# Runs every 30 minutes
schedule:
  - cron: '*/30 * * * *'
```

**Note**: GitHub Actions may have 3-10 minute delays during high usage periods.

## 🛠️ Troubleshooting

### Common Issues:

1. **Secrets not set**: Ensure all 3 secrets are configured correctly
2. **MongoDB connection**: Verify MONGODB_URI format and network access
3. **BMS login fails**: Check BMS_USERNAME and BMS_PASSWORD
4. **Timeout errors**: Normal for slow BMS responses, will retry next cycle

### Manual Testing:
```bash
# Test locally (requires .env file)
npm run scrape

# Test original version
npm run scrape-original
```

## 📈 Expected Data Flow

1. **Every 30 minutes**: GitHub Actions triggers
2. **2-5 minutes**: Scraper completes data extraction
3. **MongoDB**: Data saved to `event_summaries` and `registrations` collections
4. **Dashboard**: Real-time updates from MongoDB

## 🔐 Security Notes

- Secrets are encrypted and only accessible during workflow runs
- Browser runs in headless mode with no data persistence
- All debug files are automatically cleaned up after 7 days
