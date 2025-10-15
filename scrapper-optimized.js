require('dotenv').config();

// Fix for Node.js compatibility issues with undici/File global
if (typeof global.File === 'undefined') {
  global.File = class File {
    constructor(bits, name, options = {}) {
      this.bits = bits;
      this.name = name;
      this.type = options.type || '';
      this.lastModified = options.lastModified || Date.now();
    }
  };
}

const { chromium } = require('playwright');
const cheerio = require('cheerio');
const { MongoClient } = require('mongodb');

class OptimizedBMSScraper {
  constructor() {
    this.mongoUri = process.env.MONGODB_URI;
    this.bmsUsername = process.env.BMS_USERNAME || 'Global.youth2025';
    this.bmsPassword = process.env.BMS_PASSWORD;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.sessionCookies = null;
    
    // Performance tracking
    this.startTime = Date.now();
    this.stepTimes = {};
    
    // Validate required environment variables
    if (!this.mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }
    if (!this.bmsPassword) {
      throw new Error('BMS_PASSWORD environment variable is required');
    }
    
    console.log('✅ Environment variables validated');
    console.log(`🔑 Using BMS username: ${this.bmsUsername}`);
  }

  logStep(step, startTime) {
    const duration = Date.now() - startTime;
    this.stepTimes[step] = duration;
    console.log(`⏱️ ${step}: ${duration}ms`);
  }

  async initBrowser() {
    const stepStart = Date.now();
    console.log('🚀 Initializing browser...');
    
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images', // Block images for faster loading
        '--disable-javascript-harmony-shipping',
        '--memory-pressure-off'
      ]
    });
    
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      bypassCSP: true,
      ignoreHTTPSErrors: true,
      // Reduce viewport for faster rendering
      viewport: { width: 1024, height: 768 }
    });
    
    this.page = await this.context.newPage();
    
    // Aggressive resource blocking for speed
    await this.page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      const url = route.request().url();
      
      // Block all non-essential resources
      if (['image', 'font', 'media', 'stylesheet', 'websocket'].includes(resourceType) ||
          url.includes('analytics') || url.includes('tracking') || url.includes('ads') ||
          url.includes('.css') || url.includes('.jpg') || url.includes('.png') ||
          url.includes('.gif') || url.includes('.svg') || url.includes('.woff')) {
        route.abort();
      } else {
        route.continue();
      }
    });
    
    // Set shorter timeouts
    this.page.setDefaultTimeout(10000);
    this.page.setDefaultNavigationTimeout(15000);
    
    this.logStep('Browser initialization', stepStart);
  }

  async login() {
    const stepStart = Date.now();
    console.log('🔐 Starting optimized BMS login process...');
    
    try {
      // Navigate with minimal waiting
      await this.page.goto('https://bo.bookmyshow.com/home.aspx', {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });

      const currentUrl = this.page.url();
      
      if (currentUrl.includes('default.aspx?LOGOUT')) {
        console.log('🔑 Filling login credentials...');
        
        // Wait for form elements to be available (correct field names)
        await this.page.waitForSelector('input[name="txtUserId"]', { timeout: 10000 });
        await this.page.waitForSelector('input[name="txtPassword"]', { timeout: 10000 });
        await this.page.waitForSelector('input[name="cmdLogin"]', { timeout: 10000 });
        
        // Fill login form with correct field names
        await this.page.fill('input[name="txtUserId"]', this.bmsUsername);
        await this.page.fill('input[name="txtPassword"]', this.bmsPassword);
        
        // Submit login form with correct button name
        await this.page.click('input[name="cmdLogin"]');
        
        // Wait for successful login
        await this.page.waitForURL('**/home.aspx', { timeout: 15000 });
        console.log('✅ Login successful');
        
        // Brief wait for session
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.log('✅ Already logged in');
      }
      
      // Test navigation to report page to verify login
      console.log('🧪 Testing navigation to event summary report page...');
      await this.page.goto('https://bo.bookmyshow.com/Reports/rptEventwiseSummary.aspx', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      console.log('✅ Event summary report page accessible!');
      
      this.logStep('Login process', stepStart);
      return true;
    } catch (error) {
      console.error('❌ Login failed:', error.message);
      throw error;
    }
  }

  async getEventSummary() {
    const stepStart = Date.now();
    console.log('📊 Getting event summary with optimizations...');
    
    try {
      // Already on the event summary page from login verification
      console.log('✅ Already on event summary page from login verification');
      
      // Quick form token extraction
      const [viewState, eventValidation] = await Promise.all([
        this.page.getAttribute('input[name="__VIEWSTATE"]', 'value').catch(() => ''),
        this.page.getAttribute('input[name="__EVENTVALIDATION"]', 'value').catch(() => '')
      ]);
      
      // Get dropdown options in parallel
      const [venueOptions, eventOptions] = await Promise.all([
        this.page.$$eval('#cboVenue option', options => 
          options.map(opt => ({ value: opt.value, text: opt.textContent }))
        ).catch(() => []),
        this.page.$$eval('#cboEvent option', options => 
          options.map(opt => ({ value: opt.value, text: opt.textContent }))
        ).catch(() => [])
      ]);
      
      // Set form values quickly
      if (venueOptions.length > 0) {
        await this.page.selectOption('#cboVenue', venueOptions[0].value);
        await this.page.waitForTimeout(1000); // Reduced wait time
      }
      
      await this.page.selectOption('#cboEvent', 'ET00462825');
      await this.page.waitForTimeout(1000); // Reduced wait time
      
      // Get updated sessions
      const sessionOptions = await this.page.$$eval('#cboSession option', options => 
        options.map(opt => ({ value: opt.value, text: opt.textContent }))
      ).catch(() => []);
      
      if (sessionOptions.length > 1) {
        const sessionToSelect = sessionOptions.find(s => s.value && s.value !== '') || sessionOptions[1];
        await this.page.selectOption('#cboSession', sessionToSelect.value);
      }
      
      // Set dates quickly
      const today = new Date();
      const dateStr = today.toLocaleDateString('en-GB');
      
      await Promise.all([
        this.page.fill('#dtStartDate', dateStr),
        this.page.fill('#dtEndDate', dateStr)
      ]);
      
      // Submit form and get results
      await Promise.all([
        this.page.waitForSelector('#gvEventSummary', { timeout: 10000 }),
        this.page.click('#btnSearch')
      ]);
      
      // Extract data quickly
      const tableData = await this.page.$$eval('#gvEventSummary tr', rows => {
        return rows.slice(1).map(row => {
          const cells = row.querySelectorAll('td');
          return cells.length >= 8 ? {
            eventName: cells[0]?.textContent?.trim() || '',
            venueName: cells[1]?.textContent?.trim() || '',
            sessionName: cells[2]?.textContent?.trim() || '',
            sessionDate: cells[3]?.textContent?.trim() || '',
            sessionTime: cells[4]?.textContent?.trim() || '',
            totalCapacity: parseInt(cells[5]?.textContent?.trim() || '0'),
            totalSold: parseInt(cells[6]?.textContent?.trim() || '0'),
            totalAvailable: parseInt(cells[7]?.textContent?.trim() || '0')
          } : null;
        }).filter(Boolean);
      });
      
      this.logStep('Event summary extraction', stepStart);
      return tableData;
      
    } catch (error) {
      console.error('❌ Event summary failed:', error.message);
      throw error;
    }
  }

  async getRegistrationDetails() {
    const stepStart = Date.now();
    console.log('📝 Getting registration details with optimizations...');
    
    try {
      await this.page.goto('https://bo.bookmyshow.com/Reports/rptFormRegistrationReport.aspx', {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
      
      // Quick form setup
      const [viewState, eventValidation] = await Promise.all([
        this.page.getAttribute('input[name="__VIEWSTATE"]', 'value').catch(() => ''),
        this.page.getAttribute('input[name="__EVENTVALIDATION"]', 'value').catch(() => '')
      ]);
      
      // Set form values in parallel
      await Promise.all([
        this.page.selectOption('#cboEvent', 'ET00462825'),
        this.page.fill('#dtFromDate', new Date().toLocaleDateString('en-GB')),
        this.page.fill('#dtToDate', new Date().toLocaleDateString('en-GB'))
      ]);
      
      // Submit and wait for results
      await Promise.all([
        this.page.waitForSelector('#gvRegistrationDetails', { timeout: 10000 }),
        this.page.click('#btnSearch')
      ]);
      
      // Extract registration data
      const registrationData = await this.page.$$eval('#gvRegistrationDetails tr', rows => {
        return rows.slice(1).map(row => {
          const cells = row.querySelectorAll('td');
          return cells.length >= 10 ? {
            registrationId: cells[0]?.textContent?.trim() || '',
            customerName: cells[1]?.textContent?.trim() || '',
            mobileNumber: cells[2]?.textContent?.trim() || '',
            emailId: cells[3]?.textContent?.trim() || '',
            eventName: cells[4]?.textContent?.trim() || '',
            venueName: cells[5]?.textContent?.trim() || '',
            sessionName: cells[6]?.textContent?.trim() || '',
            sessionDate: cells[7]?.textContent?.trim() || '',
            sessionTime: cells[8]?.textContent?.trim() || '',
            ticketCount: parseInt(cells[9]?.textContent?.trim() || '0')
          } : null;
        }).filter(Boolean);
      });
      
      this.logStep('Registration details extraction', stepStart);
      return registrationData;
      
    } catch (error) {
      console.error('❌ Registration details failed:', error.message);
      throw error;
    }
  }

  async saveToMongoDB(eventData, registrationData) {
    const stepStart = Date.now();
    console.log('💾 Saving to MongoDB with optimizations...');
    
    const client = new MongoClient(this.mongoUri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000,
    });
    
    try {
      await client.connect();
      const db = client.db('bms_dashboard');
      
      const timestamp = new Date();
      
      // Use bulk operations for better performance
      const eventCollection = db.collection('event_summaries');
      const registrationCollection = db.collection('registrations');
      
      // Prepare bulk operations
      const eventOps = eventData.map(event => ({
        updateOne: {
          filter: { 
            eventName: event.eventName,
            venueName: event.venueName,
            sessionName: event.sessionName,
            sessionDate: event.sessionDate,
            sessionTime: event.sessionTime
          },
          update: { 
            $set: { 
              ...event, 
              lastUpdated: timestamp,
              scrapedAt: timestamp
            } 
          },
          upsert: true
        }
      }));
      
      const registrationOps = registrationData.map(reg => ({
        updateOne: {
          filter: { registrationId: reg.registrationId },
          update: { 
            $set: { 
              ...reg, 
              lastUpdated: timestamp,
              scrapedAt: timestamp
            } 
          },
          upsert: true
        }
      }));
      
      // Execute bulk operations in parallel
      const results = await Promise.all([
        eventOps.length > 0 ? eventCollection.bulkWrite(eventOps) : Promise.resolve(null),
        registrationOps.length > 0 ? registrationCollection.bulkWrite(registrationOps) : Promise.resolve(null)
      ]);
      
      console.log(`✅ Saved ${eventData.length} events and ${registrationData.length} registrations`);
      this.logStep('MongoDB save', stepStart);
      
    } finally {
      await client.close();
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up resources...');
    if (this.browser) {
      await this.browser.close();
    }
    
    // Log performance summary
    const totalTime = Date.now() - this.startTime;
    console.log('\n📊 Performance Summary:');
    console.log(`Total execution time: ${totalTime}ms`);
    Object.entries(this.stepTimes).forEach(([step, time]) => {
      console.log(`  ${step}: ${time}ms`);
    });
  }

  async run() {
    try {
      console.log('🚀 Starting optimized BMS scraper...');
      
      await this.initBrowser();
      await this.login();
      
      // Run both data extractions in parallel for speed
      const [eventData, registrationData] = await Promise.all([
        this.getEventSummary(),
        this.getRegistrationDetails()
      ]);
      
      await this.saveToMongoDB(eventData, registrationData);
      
      console.log('✅ Scraping completed successfully');
      
    } catch (error) {
      console.error('❌ Scraping failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Run the scraper
if (require.main === module) {
  const scraper = new OptimizedBMSScraper();
  scraper.run().catch(console.error);
}

module.exports = OptimizedBMSScraper;
