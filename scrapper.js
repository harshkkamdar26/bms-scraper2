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

class BMSScraper {
  constructor() {
    this.mongoUri = process.env.MONGODB_URI;
    this.bmsUsername = process.env.BMS_USERNAME || 'Global.youth2025';
    this.bmsPassword = process.env.BMS_PASSWORD;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.sessionCookies = null;
    
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

  async initBrowser() {
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
        '--disable-ipc-flooding-protection'
      ]
    });
    
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      // Performance optimizations
      bypassCSP: true,
      ignoreHTTPSErrors: true
    });
    
    this.page = await this.context.newPage();
    
    // Block unnecessary resources to speed up page loads
    await this.page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      // Block images, fonts, and media to speed up loading
      if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });
    
    console.log('✅ Browser initialized with performance optimizations');
  }

  async login() {
    console.log('🔐 Starting BMS login process...');
    
    try {
      // Step 1: Navigate to BMS home page (like bmsAuth.ts)
      console.log('📍 Navigating to BMS home page...');
      
      // Use faster navigation strategy - don't wait for networkidle
      await this.page.goto('https://bo.bookmyshow.com/home.aspx', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      // Step 2: Check if redirected to login page
      const currentUrl = this.page.url();
      console.log('📄 Current URL:', currentUrl);
      
      if (currentUrl.includes('default.aspx?LOGOUT')) {
        console.log('🔑 Filling login credentials...');
        
        // Wait for form elements to be available (correct field names from bmsAuth.ts)
        await this.page.waitForSelector('input[name="txtUserId"]', { timeout: 10000 });
        await this.page.waitForSelector('input[name="txtPassword"]', { timeout: 10000 });
        await this.page.waitForSelector('input[name="cmdLogin"]', { timeout: 10000 });
        
        // Fill login form with correct field names
        await this.page.fill('input[name="txtUserId"]', this.bmsUsername);
        await this.page.fill('input[name="txtPassword"]', this.bmsPassword);
        
        console.log('📤 Submitting login form...');
        
        // Take screenshot before login
        try {
          await this.page.screenshot({ path: 'debug-before-login.png', fullPage: true });
          console.log('📸 Screenshot saved: debug-before-login.png');
        } catch (e) {
          console.log('⚠️ Could not save screenshot:', e.message);
        }
        
        // Submit login form with correct button name
        await this.page.click('input[name="cmdLogin"]');
        
        // Wait for successful login with longer timeout and better error handling
        try {
          await this.page.waitForURL('**/home.aspx', { timeout: 30000 });
          console.log('✅ Login successful!');
        } catch (error) {
          // Take screenshot on failure
          try {
            await this.page.screenshot({ path: 'debug-login-failed.png', fullPage: true });
            console.log('📸 Login failed screenshot saved: debug-login-failed.png');
          } catch (e) {
            console.log('⚠️ Could not save failure screenshot');
          }
          
          const currentUrl = this.page.url();
          console.log('📄 Current URL after login attempt:', currentUrl);
          console.log('📄 Page title after login attempt:', await this.page.title());
          
          // Check if there's an error message on the page
          const bodyText = await this.page.evaluate(() => document.body.innerText);
          console.log('📄 Page content (first 500 chars):', bodyText.substring(0, 500));
          
          // Check if redirected to password reset page
          if (currentUrl.includes('frmResetPassword.aspx')) {
            console.log('');
            console.log('🚨 ═══════════════════════════════════════════════════════════════');
            console.log('🚨 PASSWORD RESET REQUIRED!');
            console.log('🚨 ═══════════════════════════════════════════════════════════════');
            console.log('');
            console.log('❌ BMS is forcing a password change for this account.');
            console.log('');
            console.log('📋 ACTION REQUIRED:');
            console.log('   1. Go to: https://bo.bookmyshow.com/');
            console.log('   2. Log in with current credentials');
            console.log('   3. Complete the password change process');
            console.log('   4. Update GitHub Secret: BMS_PASSWORD with the new password');
            console.log('');
            console.log('🔧 To update the secret:');
            console.log('   • Go to: https://github.com/harshkkamdar26/bms-scraper2/settings/secrets/actions');
            console.log('   • Edit BMS_PASSWORD');
            console.log('   • Enter the new password');
            console.log('   • Save');
            console.log('');
            console.log('🚨 ═══════════════════════════════════════════════════════════════');
            console.log('');
            throw new Error('PASSWORD_RESET_REQUIRED: BMS account requires password change');
          }
          
          throw error;
        }
        
        // Reduced wait time for session
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.log('ℹ️ Already logged in');
      }

      // Step 3: Extract session cookies
      const cookies = await this.context.cookies();
      this.sessionCookies = {};
      
      cookies.forEach(cookie => {
        this.sessionCookies[cookie.name] = cookie.value;
      });
      
      console.log('✅ Session cookies extracted');
      console.log('🍪 Session cookies count:', Object.keys(this.sessionCookies).length);
      
      // CRITICAL: Test navigation to report page like bmsAuth.ts does
      console.log('🧪 Testing navigation to event summary report page (like bmsAuth.ts)...');
      try {
        await this.page.goto('https://bo.bookmyshow.com/Reports/rptEventwiseSummary.aspx', {
      waitUntil: 'networkidle',
      timeout: 30000 
    });
        console.log('✅ Event summary report page accessible!');
        console.log('📄 Report page URL:', this.page.url());
        console.log('📄 Report page title:', await this.page.title());
        
        // Extract form tokens to verify page is working
        const viewState = await this.page.getAttribute('input[name="__VIEWSTATE"]', 'value') || '';
        const eventValidation = await this.page.getAttribute('input[name="__EVENTVALIDATION"]', 'value') || '';
        console.log('🔧 ViewState length:', viewState.length);
        console.log('🔧 EventValidation length:', eventValidation.length);
        
        if (viewState.length > 0 && eventValidation.length > 0) {
          console.log('✅ Form tokens extracted successfully - session is fully working!');
        } else {
          console.log('⚠️ Form tokens missing - session may have issues');
        }
        
      } catch (error) {
        console.log('❌ Event summary report page not accessible:', error.message);
        throw new Error('Session authentication failed - cannot access report pages');
      }
      
    } catch (error) {
      console.error('❌ Login failed:', error.message);
      throw error;
    }
  }

  async scrapeEventSummary() {
    console.log('📊 Scraping Event Summary...');
    
    try {
      // Check if we're already on the event summary page (from login verification)
      const currentUrl = this.page.url();
      console.log('🔍 Current page URL:', currentUrl);
      
      if (!currentUrl.includes('rptEventwiseSummary.aspx')) {
        // Only navigate if we're not already on the event summary page
        console.log('📝 Loading event summary report page...');
        await this.page.goto('https://bo.bookmyshow.com/Reports/rptEventwiseSummary.aspx', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
      } else {
        console.log('✅ Already on event summary page - reusing from login verification');
      }
      
      console.log('✅ Event summary page ready');
      console.log('📄 Current URL:', this.page.url());
      console.log('📄 Page title:', await this.page.title());
      
      // Step 2: Extract form tokens and inspect actual form values
      console.log('🔍 Extracting form tokens...');
      const viewState = await this.page.getAttribute('input[name="__VIEWSTATE"]', 'value') || '';
      const viewStateGenerator = await this.page.getAttribute('input[name="__VIEWSTATEGENERATOR"]', 'value') || '';
      const eventValidation = await this.page.getAttribute('input[name="__EVENTVALIDATION"]', 'value') || '';
      
      // Debug: Check what values are actually available in the form
      console.log('🔍 Inspecting form dropdown values...');
      const venueOptions = await this.page.$$eval('#cboVenue option', options => 
        options.map(opt => ({ value: opt.value, text: opt.textContent }))
      ).catch(() => []);
      const eventOptions = await this.page.$$eval('#cboEvent option', options => 
        options.map(opt => ({ value: opt.value, text: opt.textContent }))
      ).catch(() => []);
      const sessionOptions = await this.page.$$eval('#cboSession option', options => 
        options.map(opt => ({ value: opt.value, text: opt.textContent }))
      ).catch(() => []);
      
      console.log('🏢 Available venues:', JSON.stringify(venueOptions, null, 2));
      console.log('🎭 Available events:', JSON.stringify(eventOptions, null, 2));
      console.log('📅 Available sessions:', JSON.stringify(sessionOptions, null, 2));
      
      console.log('✅ Form tokens extracted');
      
      // Step 3: Submit form using Playwright form interaction (like registration details)
      console.log('🔧 Setting form values using Playwright...');
      
      // Debug: Take a screenshot to see the current page state
      console.log('📸 Taking screenshot for debugging...');
      await this.page.screenshot({ path: 'debug-event-summary-form.png', fullPage: true });
      
      // Debug: Check if elements exist and their visibility
      const eventElementInfo = await this.page.evaluate(() => {
        const element = document.getElementById('cboEvent');
        return {
          exists: !!element,
          visible: element ? window.getComputedStyle(element).display !== 'none' : false,
          hidden: element ? element.hidden : false,
          style: element ? element.style.cssText : null,
          className: element ? element.className : null
        };
      });
      console.log('🔍 Event element info:', eventElementInfo);
      
      // Try to make elements visible if they're hidden
      if (eventElementInfo.exists && !eventElementInfo.visible) {
        console.log('👁️ Making form elements visible...');
        await this.page.evaluate(() => {
          const cboEvent = document.getElementById('cboEvent');
          const cboSession = document.getElementById('cboSession');
          const cboVenue = document.getElementById('cboVenue');
          
          if (cboEvent) {
            cboEvent.style.display = 'block';
            cboEvent.style.visibility = 'visible';
            cboEvent.hidden = false;
          }
          if (cboSession) {
            cboSession.style.display = 'block';
            cboSession.style.visibility = 'visible';
            cboSession.hidden = false;
          }
          if (cboVenue) {
            cboVenue.style.display = 'block';
            cboVenue.style.visibility = 'visible';
            cboVenue.hidden = false;
          }
        });
        
        // Wait a bit for changes to take effect
        await this.page.waitForTimeout(1000);
      }
      
      // First select venue to trigger session loading
      if (venueOptions.length > 0) {
        console.log('🏢 Setting venue to:', venueOptions[0].value);
        await this.page.selectOption('#cboVenue', venueOptions[0].value);
        await this.page.waitForTimeout(2000); // Wait for sessions to load
      }
      
      // Set the dropdown values directly
      console.log('🎭 Setting event to: ET00462825');
      await this.page.selectOption('#cboEvent', 'ET00462825');
      
      // Wait for sessions to load after event selection
      await this.page.waitForTimeout(2000);
      
      // Check available sessions again after event selection
      const updatedSessionOptions = await this.page.$$eval('#cboSession option', options => 
        options.map(opt => ({ value: opt.value, text: opt.textContent }))
      ).catch(() => []);
      console.log('📅 Updated available sessions:', JSON.stringify(updatedSessionOptions, null, 2));
      
      // Select the first available session (or the specific one if available)
      if (updatedSessionOptions.length > 1) { // Skip empty option
        const sessionToSelect = updatedSessionOptions.find(s => s.value && s.value !== '') || updatedSessionOptions[1];
        console.log('📅 Setting session to:', sessionToSelect.value);
        await this.page.selectOption('#cboSession', sessionToSelect.value);
      }
      
      // Check current date field values (they might already be set)
      const startDateValue = await this.page.getAttribute('#dtStartDate', 'value');
      const endDateValue = await this.page.getAttribute('#dtEndDate', 'value');
      console.log('📅 Current date values - Start:', startDateValue, 'End:', endDateValue);
      
      // Skip date filling if they already have values, otherwise set them
      if (!startDateValue || !endDateValue) {
        console.log('📅 Setting date fields...');
        // Make date fields visible first
        await this.page.evaluate(() => {
          const dtStart = document.getElementById('dtStartDate');
          const dtEnd = document.getElementById('dtEndDate');
          if (dtStart) {
            dtStart.style.display = 'block';
            dtStart.style.visibility = 'visible';
            dtStart.hidden = false;
          }
          if (dtEnd) {
            dtEnd.style.display = 'block';
            dtEnd.style.visibility = 'visible';
            dtEnd.hidden = false;
          }
        });
        
        const currentDate = new Date().toLocaleDateString('en-GB');
        const currentTime = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
        
        await this.page.fill('#dtStartDate', `${currentDate} ${currentTime}`);
        await this.page.fill('#dtEndDate', `${currentDate} ${currentTime}`);
      } else {
        console.log('📅 Date fields already have values, skipping...');
      }
      
      console.log('🔧 Submitting form using direct POST request (like dataFetcher.ts)...');
      
      // Use direct POST request approach like dataFetcher.ts (not Playwright form interaction)
      const formData = new URLSearchParams({
        '__EVENTTARGET': 'btnSummReport',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': viewState,
        '__VIEWSTATEGENERATOR': viewStateGenerator,
        '__VIEWSTATEENCRYPTED': '',
        '__EVENTVALIDATION': eventValidation,
        'cboVenue': 'JWGM',
        'cboEvent': 'ET00462825',
        'cboSession': '10364',
        'dtStartDate': new Date().toLocaleDateString('en-GB').replace(/\//g, '+') + '+' + new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' }).replace(':', '%3A'),
        'dtEndDate': new Date().toLocaleDateString('en-GB').replace(/\//g, '+') + '+' + new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' }).replace(':', '%3A')
      });
      
      // Convert session cookies to cookie string
      const cookieString = Object.entries(this.sessionCookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      
      const response = await this.page.evaluate(async ({ formData, cookieString }) => {
        const response = await fetch('https://bo.bookmyshow.com/Reports/rptEventwiseSummary.aspx', {
          method: 'POST',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,hi;q=0.6',
            'Cache-Control': 'max-age=0',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://bo.bookmyshow.com',
            'Referer': 'https://bo.bookmyshow.com/Reports/rptEventwiseSummary.aspx',
            'Cookie': cookieString,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
          },
          body: formData
        });
        
        return {
          status: response.status,
          statusText: response.statusText,
          text: await response.text()
        };
      }, { formData: formData.toString(), cookieString });
      
      if (response.status !== 200) {
        throw new Error(`Event summary request failed: ${response.status} ${response.statusText}`);
      }
      
      console.log('✅ Event summary data received');
      
      // Save response to file for debugging
      const fs = require('fs');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const debugFile = `debug-event-summary-response-${timestamp}.html`;
      const responseText = response.text;
      fs.writeFileSync(debugFile, responseText);
      console.log(`💾 Saved event summary response to ${debugFile} for debugging`);
      console.log('📄 Event summary response length:', responseText.length);
      
      // Check what type of response we got
      if (responseText.includes('Event Name') && responseText.includes('Show Date')) {
        console.log('🎉 SUCCESS! Response contains event summary data headers');
      } else if (responseText.includes('btnSummReport') || responseText.includes('cboVenue')) {
        console.log('⚠️ Got the form page instead of results - form submission failed');
      } else {
        console.log('❓ Unknown response type - preview:', responseText.substring(0, 500));
      }
      
      // Step 4: Parse the response
      const events = this.parseEventSummaryData(responseText);
    console.log(`✅ Found ${events.length} events`);
      
    return events;
      
    } catch (error) {
      console.error('❌ Failed to scrape event summary:', error.message);
      return [];
    }
  }

  async scrapeRegistrationDetails() {
    console.log('📋 Scraping Registration Details...');
    
    try {
      // Step 1: Navigate to registration details report page (session already verified in login)
      console.log('📝 Loading registration details report page...');
      
      await this.page.goto('https://bo.bookmyshow.com/Reports/rptFormRegistrationReport.aspx', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

      console.log('✅ Successfully navigated to registration details page');
      console.log('📄 Current URL:', this.page.url());
      console.log('📄 Page title:', await this.page.title());
      
      // Step 2: Dynamically detect session first, then extract fresh form tokens
      console.log('🎭 Selecting event to load sessions...');
      await this.page.selectOption('#cboEvent', 'ET00462825');
      await this.page.waitForTimeout(2000); // Wait for sessions to load
      
      // Dynamically get the available sessions
      const sessionOptions = await this.page.$$eval('#cboSession option', options => 
        options.map(opt => ({ value: opt.value, text: opt.textContent.trim() }))
      );
      console.log('📅 Available sessions:', JSON.stringify(sessionOptions, null, 2));
      
      // Find the first non-empty session
      const targetSession = sessionOptions.find(s => s.value && s.value !== '') || sessionOptions[1];
      if (!targetSession || !targetSession.value) {
        throw new Error('No valid session found in registration form');
      }
      console.log('📅 Using session:', targetSession.text);
      
      // Now select the session to ensure form is fully updated
      await this.page.selectOption('#cboSession', targetSession.value);
      await this.page.waitForTimeout(1000); // Wait for any form updates
      
      // Extract form tokens AFTER all form interactions to ensure they're fresh
      console.log('🔍 Extracting fresh form tokens after session selection...');
      const viewState = await this.page.getAttribute('input[name="__VIEWSTATE"]', 'value') || '';
      const viewStateGenerator = await this.page.getAttribute('input[name="__VIEWSTATEGENERATOR"]', 'value') || '';
      const eventValidation = await this.page.getAttribute('input[name="__EVENTVALIDATION"]', 'value') || '';
      
      console.log('✅ Form tokens extracted');
      
      // Step 3: Submit form using Playwright's native form submission (like dataFetcher.ts)
      console.log('🔧 Setting form values using Playwright...');
      
      await this.page.evaluate((formDataParams) => {
        const form = document.getElementById('frmFormRegistrationReport');
        if (form) {
          // Set hidden fields
          const eventTarget = document.getElementById('__EVENTTARGET');
          const eventArgument = document.getElementById('__EVENTARGUMENT');
          const viewStateEl = document.getElementById('__VIEWSTATE');
          const viewStateGenEl = document.getElementById('__VIEWSTATEGENERATOR');
          const eventValidationEl = document.getElementById('__EVENTVALIDATION');
          
          if (eventTarget) eventTarget.value = formDataParams.__EVENTTARGET;
          if (eventArgument) eventArgument.value = formDataParams.__EVENTARGUMENT;
          if (viewStateEl) viewStateEl.value = formDataParams.__VIEWSTATE;
          if (viewStateGenEl) viewStateGenEl.value = formDataParams.__VIEWSTATEGENERATOR;
          if (eventValidationEl) eventValidationEl.value = formDataParams.__EVENTVALIDATION;
          
          // Set form fields
          const cboCinema = document.getElementById('cboCinema');
          const cboEvent = document.getElementById('cboEvent');
          const cboSession = document.getElementById('cboSession');
          const chkSelect = document.getElementById('chkSelect');
          const hdnCinema = document.getElementById('hdnCinema');
          const hdnEvent = document.getElementById('hdnEvent');
          const hdnSession = document.getElementById('hdnSession');
          
          if (cboCinema) cboCinema.value = formDataParams.cboCinema;
          if (cboEvent) cboEvent.value = formDataParams.cboEvent;
          if (cboSession) cboSession.value = formDataParams.cboSession;
          if (chkSelect) chkSelect.checked = formDataParams.chkSelect === 'on';
          if (hdnCinema) hdnCinema.value = formDataParams.hdnCinema;
          if (hdnEvent) hdnEvent.value = formDataParams.hdnEvent;
          if (hdnSession) hdnSession.value = formDataParams.hdnSession;
        }
      }, {
        __EVENTTARGET: 'btnShowReport',
        __EVENTARGUMENT: '',
        __VIEWSTATE: viewState,
        __VIEWSTATEGENERATOR: viewStateGenerator,
        __EVENTVALIDATION: eventValidation,
        cboCinema: 'JWGM',
        cboEvent: 'ET00462825',
        cboSession: targetSession.value,
        chkSelect: 'on',
        hdnCinema: 'JWGM',
        hdnEvent: 'ET00462825',
        hdnSession: targetSession.value
      });
      
      console.log('🔧 Submitting form using Playwright...');
      console.log('⏳ Waiting for response (up to 90 seconds for large datasets)...');
      
      // Ensure button is ready
      await this.page.waitForSelector('#btnShowReport', { state: 'visible', timeout: 5000 });
      
      // Submit the form and wait for response with extended timeout for large datasets
      let response;
      try {
        [response] = await Promise.all([
          this.page.waitForResponse(response => 
            response.url().includes('rptFormRegistrationReport.aspx') && 
            response.request().method() === 'POST',
            { timeout: 90000 } // 90 second timeout for large datasets (2700+ records)
          ),
          this.page.click('#btnShowReport', { force: true })
        ]);
        console.log('✅ Got POST response from server');
      } catch (error) {
        console.error('❌ Error waiting for response:', error);
        // Fallback: wait for page to finish loading
        console.log('🔄 Waiting for page to finish loading results...');
        await this.page.waitForLoadState('networkidle', { timeout: 60000 });
        response = null; // We'll handle this case below
      }
      
      let responseData;
      if (response) {
        responseData = {
          status: response.status(),
          statusText: response.statusText(),
          text: await response.text(),
          url: response.url()
        };
      } else {
        // Fallback: get page content directly
        console.log('⚠️ No response object, getting page content directly...');
        const pageContent = await this.page.content();
        responseData = {
          status: 200,
          statusText: 'OK',
          text: pageContent,
          url: this.page.url()
        };
      }
      
      if (responseData.status !== 200) {
        throw new Error(`Registration report request failed: ${responseData.status} ${responseData.statusText}`);
      }
      
      console.log('✅ Registration report data received');
      console.log('📄 Response status:', responseData.status);
      console.log('📄 Response URL:', responseData.url);
      console.log('📄 Response text length:', responseData.text.length);
      
      const content = responseData.text;
    
    // Save response to file for debugging
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const debugFile = `debug-registration-response-${timestamp}.html`;
    fs.writeFileSync(debugFile, content);
    console.log(`💾 Saved response to ${debugFile} for debugging`);
    console.log('📄 Response length:', content.length);
    
    // Check what type of response we got
    if (content.includes('Cinema_Name') && content.includes('first_name')) {
      console.log('🎉 SUCCESS! Response contains columnwise registration data headers');
    } else if (content.includes('btnShowReport') || content.includes('cboCinema')) {
      console.log('⚠️ Got the form page instead of results - form submission failed');
    } else {
      console.log('❓ Unknown response type - preview:', content.substring(0, 500));
    }
    
    const $ = cheerio.load(content);
    
    const registrations = [];
    let headerRowIndex = 0;
    
    // Find data table
    let totalRowsProcessed = 0;
    let skippedRows = 0;
    
    $('table').each((i, table) => {
      const tableText = $(table).text();
      if (tableText.includes('Cinema_Name') && tableText.includes('Event_Name')) {
        const rows = $(table).find('tr');
        console.log(`📊 Found data table with ${rows.length} total rows`);
        
        // Find header row
        rows.each((i, row) => {
          const thCells = $(row).find('th');
          if (thCells.length > 0) {
            headerRowIndex = i;
            return false;
          }
        });
        
        console.log(`📋 Header row at index: ${headerRowIndex}`);
        
        // Parse data rows
        rows.each((i, row) => {
          if (i <= headerRowIndex) return;
          
          totalRowsProcessed++;
          const cells = $(row).find('td');
          
          if (cells.length < 45) {
            console.log(`⚠️ Row ${i}: Skipped - only ${cells.length} cells (need 45+)`);
            skippedRows++;
            return;
          }
          
          if (cells.length >= 45) {
            try {
              // Handle both form versions:
              // OLD FORM (until Oct 8): first_name + last_name in columns 20-21
              // NEW FORM (from Oct 9): full_name in column 45
              let firstName = $(cells[20]).text().trim(); // Column 20: first_name
              let lastName = $(cells[21]).text().trim(); // Column 21: last_name
              const fullNameField = $(cells[45]).text().trim(); // Column 45: full_name (NEW)
              
              // If first_name and last_name are empty, try full_name
              if ((!firstName && !lastName) && fullNameField) {
                // Split full_name into first and last
                const nameParts = fullNameField.split(' ');
                if (nameParts.length > 0) {
                  firstName = nameParts[0];
                  lastName = nameParts.slice(1).join(' ') || firstName; // Use first name as last if only one word
                }
              }
              
              let customerName = `${firstName} ${lastName}`.trim();
              const transDate = $(cells[4]).text().trim();
              const transId = $(cells[2]).text().trim();
              
              // Parse ticket info for complimentary handling
              const ticketQty = this.parseNumber($(cells[10]).text()) || 1;
              const ticketAmt = this.parseNumber($(cells[11]).text()) || 0;
              const seatInfo = $(cells[9]).text().trim();
              
              // Check if this is a complimentary ticket
              const isComplimentary = ticketAmt === 0 || (seatInfo && seatInfo.toLowerCase().includes('complimentary'));
              
              // For complimentary tickets: use FullName/MobileNumber if first_name is empty or Guest_
              const fullNameFromComp = $(cells[49]).text().trim(); // Column 49: FullName
              const mobileFromComp = $(cells[50]).text().trim(); // Column 50: MobileNumber
              let phoneNumber = $(cells[24]).text().trim(); // Column 24: primary_phoneNo
              
              if (isComplimentary && (!firstName || firstName.startsWith('Guest_') || !customerName || customerName.length === 0)) {
                if (fullNameFromComp && fullNameFromComp.trim()) {
                  // Extract name - remove parenthetical notes like "(mybollywoodplaylist)"
                  const cleanName = fullNameFromComp.split('(')[0].trim();
                  if (cleanName) {
                    const nameParts = cleanName.split(' ');
                    firstName = nameParts[0] || '';
                    lastName = nameParts.slice(1).join(' ') || '';
                    customerName = cleanName;
                  }
                }
                if (mobileFromComp && mobileFromComp.trim() && !phoneNumber) {
                  phoneNumber = mobileFromComp;
                }
              }
              
              // Handle missing names - use fallback identifier
              if (!customerName || customerName.length === 0) {
                console.log(`⚠️ Row ${i}: WARNING - No name found, using Trans_Id as identifier: ${transId}`);
                // Use transaction ID as fallback identifier
                firstName = `Guest_${transId.substring(0, 8)}`;
                lastName = '';
                customerName = `${firstName} ${lastName}`.trim();
              }
              
              // Build the base record object
              const baseRecord = {
                // All 45 BMS fields - EXACT mapping from dataFetcher.ts
                BackgroundColor: $(cells[0]).text().trim(),
                Bkg_Id: $(cells[1]).text().trim(),
                Trans_Id: transId,
                Bkg_Commit: $(cells[3]).text().trim(),
                Trans_Date: transDate,
                Cinema_Name: $(cells[5]).text().trim(),
                Event_Name: $(cells[6]).text().trim() || 'Global Youth Festival 2025',
                Show_Date_Disp: $(cells[7]).text().trim(),
                Ticketwise_Qty: this.parseNumber($(cells[8]).text()) || 0,
                Seat_Info: seatInfo,
                Ticket_Qty: 1, // Always 1 per record (we duplicate for multi-ticket comps)
                Ticket_Amt: ticketAmt,
                Item_Desc: $(cells[12]).text().trim(),
                ItemWise_Qty: this.parseNumber($(cells[13]).text()) || 0,
                ItemWise_Amt: this.parseNumber($(cells[14]).text()) || 0,
                Inv_Qty: this.parseNumber($(cells[15]).text()) || 0,
                Inv_Amt: this.parseNumber($(cells[16]).text()) || 0,
                Additional_Desc: $(cells[17]).text().trim(),
                Add_strAmt: this.parseNumber($(cells[18]).text()) || 0,
                Add_Charges: this.parseNumber($(cells[19]).text()) || 0,
                first_name: firstName, // Column 20
                last_name: lastName, // Column 21
                age: this.parseNumber($(cells[22]).text()) || this.parseNumber($(cells[53]).text()) || 0, // Column 22 (old age) or Column 53 (new age_16_only_)
                gender: $(cells[23]).text().trim(), // Column 23
                primary_phoneNo: phoneNumber, // Column 24 or from FullName for comps
                primary_email: this.extractProtectedEmail($(cells[25]).text().trim()), // Column 25
                pincode: $(cells[26]).text().trim(), // Column 26
                do_you_wish_to_take_part_in_a_sports_tournament_tentatively_on_the_29th_and_30th_november_: $(cells[27]).text().trim(), // Column 27
                enter_details_of_people_you_d_like_to_refer_for_early_bird_access: $(cells[28]).text().trim(), // Column 28
                name_1: $(cells[29]).text().trim(), // Column 29
                mobile_number_1: $(cells[30]).text().trim(), // Column 30
                email_id_1: this.extractProtectedEmail($(cells[31]).text().trim()), // Column 31
                name_2: $(cells[32]).text().trim(), // Column 32
                mobile_number_2: $(cells[33]).text().trim(), // Column 33
                email_id_2: this.extractProtectedEmail($(cells[34]).text().trim()), // Column 34
                name_3: $(cells[35]).text().trim(), // Column 35
                mobile_number_3: $(cells[36]).text().trim(), // Column 36
                email_id_3: this.extractProtectedEmail($(cells[37]).text().trim()), // Column 37
                name_4: $(cells[38]).text().trim(), // Column 38
                mobile_number_4: $(cells[39]).text().trim(), // Column 39
                email_id_4: this.extractProtectedEmail($(cells[40]).text().trim()), // Column 40
                name_5: $(cells[41]).text().trim(), // Column 41
                mobile_number_5: $(cells[42]).text().trim(), // Column 42
                email_id_5: this.extractProtectedEmail($(cells[43]).text().trim()), // Column 43
                i_agree_to_the_terms_and_conditions_: $(cells[44]).text().trim(), // Column 44
                full_name: fullNameField, // Column 45
                pin_code: $(cells[46]).text().trim(), // Column 46
                would_you_be_interested_in_participating_in_a_sports_tournament_happening_on_the_29th_and_30th_november_: $(cells[47]).text().trim(), // Column 47
                would_you_like_to_participate_in_the_great_inflate_run_on_7th_december_a_high_energy_sunday_morning_experience_at_gyf_featuring_an_inflatable_obstacle_course_cold_plunges_a_juice_bar_mindful_breathing_and_more_included_in_your_gyf_ticket_details_will_follow_after_registration_: $(cells[48]).text().trim(), // Column 48
                FullName: fullNameFromComp, // Column 49
                MobileNumber: mobileFromComp, // Column 50
                Email: this.extractProtectedEmail($(cells[51]).text().trim()), // Column 51
                Remarks: $(cells[52]).text().trim(), // Column 52
                age_16_only_: this.parseNumber($(cells[53]).text()) || 0, // Column 53
                
                // Legacy fields for compatibility - EXACT mapping from dataFetcher.ts
                eventName: $(cells[6]).text().trim() || 'Global Youth Festival 2025',
                customerName: customerName,
                phone: phoneNumber, // Column 24 or from FullName for comps
                email: this.extractProtectedEmail($(cells[25]).text().trim()), // Column 25: primary_email
                ticketType: $(cells[12]).text().trim() && $(cells[12]).text().trim() !== '-' ? $(cells[12]).text().trim() : 
                           seatInfo && seatInfo !== '-' ? seatInfo : 'Festival Pass',
                quantity: 1, // Always 1 per record
                amount: ticketAmt,
                registrationDate: this.parseDate(transDate) || new Date(),
                paymentStatus: 'Confirmed',
                bookingReference: $(cells[3]).text().trim(),
                showDate: new Date('2025-12-06T14:00:00'),
                
                // Metadata
                fetchedAt: new Date(),
                reportGeneratedAt: new Date(),
                dataSource: 'github_actions_scrape',
                isManualRefresh: false
              };
              
              // For complimentary tickets with qty > 1, create multiple entries
              // This ensures registration count matches totalOffLoadedQty
              const entriesToCreate = (isComplimentary && ticketQty > 1) ? ticketQty : 1;
              
              for (let entryIndex = 0; entryIndex < entriesToCreate; entryIndex++) {
                const record = { ...baseRecord };
                
                // Create registrationId - keep it simple, just use Trans_Id
                if (entriesToCreate > 1) {
                  // For duplicated complimentary entries, add suffix to distinguish
                  record.registrationId = `${transId}_comp_${entryIndex + 1}`;
                  if (entryIndex === 0) {
                    console.log(`🎫 Complimentary ticket ${transId}: Creating ${entriesToCreate} entries for ${customerName}`);
                  }
                } else {
                  // Normal case - just use the BMS transaction ID
                  record.registrationId = transId;
                }
                
                registrations.push(record);
                
                if (registrations.length <= 10 || registrations.length % 100 === 0) {
                  console.log(`✅ Added registration #${registrations.length}: ${customerName} (${transId})`);
                }
              }
            } catch (error) {
              console.warn(`⚠️ Error parsing row ${i}:`, error.message);
              skippedRows++;
            }
          }
        });
        
        return false; // Break out of table loop
      }
    });

    console.log('');
    console.log('=== TICKET HOLDER PARSING SUMMARY ===');
    console.log(`📊 Total rows processed: ${totalRowsProcessed}`);
    console.log(`🎫 Ticket holders parsed: ${registrations.length}`);
    console.log(`⚠️ Skipped rows: ${skippedRows}`);
    console.log(`🔍 Unique registrations: ${new Set(registrations.map(r => r.Trans_Id)).size}`);
    console.log(`👥 Total ticket holders: ${registrations.length}`);
    console.log('=====================================');
    console.log('');
    
    // SECOND PASS: Fill missing transaction details for people who bought tickets together
    console.log('🔄 Filling missing transaction details for group purchases...');
    const transactionGroups = {};
    
    // Group by Trans_Id
    registrations.forEach(reg => {
      if (!transactionGroups[reg.Trans_Id]) {
        transactionGroups[reg.Trans_Id] = [];
      }
      transactionGroups[reg.Trans_Id].push(reg);
    });
    
    let filledCount = 0;
    Object.keys(transactionGroups).forEach(transId => {
      const group = transactionGroups[transId];
      if (group.length > 1) {
        // Find the primary ticket holder (the one with complete transaction details)
        const primaryHolder = group.find(person => 
          person.Trans_Date && person.Cinema_Name && person.Event_Name && 
          person.Show_Date_Disp && person.Ticket_Qty > 0
        ) || group[0]; // Fallback to first person if none found
        
        // Fill missing details for all other people in this transaction
        group.forEach(person => {
          if (person !== primaryHolder) {
            // Copy transaction details from primary holder
            const fieldsToFill = [
              'Trans_Date', 'Cinema_Name', 'Event_Name', 'Show_Date_Disp',
              'Ticketwise_Qty', 'Seat_Info', 'Ticket_Qty', 'Ticket_Amt',
              'Item_Desc', 'ItemWise_Qty', 'ItemWise_Amt', 'Inv_Qty', 'Inv_Amt',
              'Additional_Desc', 'Add_strAmt', 'Add_Charges', 'Bkg_Commit'
            ];
            
            let hasEmptyFields = false;
            fieldsToFill.forEach(field => {
              if (!person[field] || person[field] === '' || person[field] === 0) {
                person[field] = primaryHolder[field];
                hasEmptyFields = true;
              }
            });
            
            if (hasEmptyFields) {
              filledCount++;
              console.log(`✅ Filled transaction details for ${person.first_name} ${person.last_name} (Trans_Id: ${transId})`);
            }
          }
        });
      }
    });
    
    console.log(`🔄 Filled missing details for ${filledCount} ticket holders in group purchases`);
    console.log('');
    
    return registrations;
    
    } catch (error) {
      console.error('❌ Failed to scrape registration details:', error.message);
      return [];
    }
  }

  parseDate(dateStr) {
    if (!dateStr) return new Date();
    try {
      // Handle DD-MM-YYYY HH:mm:ss format
      if (dateStr.includes(' ')) {
        const datePart = dateStr.split(' ')[0];
        const [day, month, year] = datePart.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      return new Date(dateStr);
    } catch {
      return new Date();
    }
  }

  parseEventSummaryData(htmlContent) {
    const $ = cheerio.load(htmlContent);
    const data = [];
    
    console.log('📝 Parsing event summary data from HTML response...');
    console.log('📊 HTML content length:', htmlContent.length);
    
    // Find the main data table
    const tables = $('table');
    console.log(`🔍 Found ${tables.length} tables in the response`);
    let dataTable = null;
    
    // Look for the table with event data - try multiple patterns
    tables.each((i, table) => {
      const headerText = $(table).text();
      console.log(`📋 Table ${i} text preview:`, headerText.substring(0, 200));
      
      if (headerText.includes('Event Name') && headerText.includes('Show Date')) {
        console.log(`✅ Found event summary data table at index ${i}`);
        dataTable = $(table);
        return false; // break
      }
    });
    
    if (!dataTable) {
      console.log('⚠️ Event summary data table not found, checking for any table with data...');
      // Fallback: look for any table with multiple rows
      tables.each((i, table) => {
        const rows = $(table).find('tr');
        if (rows.length > 2) { // Header + at least one data row
          console.log(`📋 Checking table ${i} with ${rows.length} rows`);
          const headerText = $(table).text();
          if (headerText.includes('Global Youth Festival') || headerText.includes('Mumbai')) {
            console.log(`✅ Found potential event data table at index ${i}`);
            dataTable = $(table);
            return false;
          }
        }
      });
    }
    
    if (!dataTable) {
      console.log('❌ No suitable event summary data table found');
      return data;
    }
    
    console.log('✅ Found event summary data table, parsing rows...');
    
    // Parse table rows (skip header and total rows)
    const rows = dataTable.find('tr');
    console.log(`📊 Found ${rows.length} rows in data table`);
    
    rows.each((i, row) => {
      const cells = $(row).find('td');
      console.log(`📋 Row ${i}: ${cells.length} cells`);
      
      if (cells.length >= 21 && !$(row).text().includes('Total :')) {
        try {
          const record = {
            eventName: $(cells[0]).text().trim() || 'Global Youth Festival 2025',
            showDate: new Date($(cells[1]).text().trim()) || new Date('2025-12-06T14:00:00'),
            location: $(cells[2]).text().trim() || 'Mumbai: Western',
            venue: 'Jio World Garden, BKC: Mumbai',
            capacity: this.parseNumber($(cells[3]).text()) || 5000,
            killed: this.parseNumber($(cells[4]).text()) || 0,
            otherSeat: this.parseNumber($(cells[5]).text()) || 0,
            reserveSeat: this.parseNumber($(cells[6]).text()) || 0,
            specialSeat: this.parseNumber($(cells[7]).text()) || 0,
            availableForSale: this.parseNumber($(cells[8]).text()) || 5000,
            ticketSold: this.parseNumber($(cells[9]).text()) || 0,
            soldAmount: this.parseNumber($(cells[10]).text()) || 0,
            debtorDiscAmount: this.parseNumber($(cells[11]).text()) || 0,
            netSoldAmount: this.parseNumber($(cells[12]).text()) || 0,
            compQty: this.parseNumber($(cells[13]).text()) || 0,
            compAmount: this.parseNumber($(cells[14]).text()) || 0,
            unpaidCOD: this.parseNumber($(cells[15]).text()) || 0,
            unpaidQty: this.parseNumber($(cells[16]).text()) || 0,
            totalOffLoadedQty: this.parseNumber($(cells[17]).text()) || 0,
            totalOffLoadedAmount: this.parseNumber($(cells[18]).text()) || 0,
            socialDistancingCount: this.parseNumber($(cells[19]).text()) || 0,
            available: this.parseNumber($(cells[20]).text()) || 0,
            fetchedAt: new Date(),
            reportGeneratedAt: new Date(),
            dataSource: 'github_actions_scrape'
          };
          
          console.log(`📋 Parsing event row ${i}: ${record.eventName}, Sold: ${record.ticketSold}, Amount: ${record.soldAmount}`);
          data.push(record);
        } catch (error) {
          console.warn(`⚠️ Error parsing event row ${i}:`, error);
        }
      }
    });
    
    console.log(`📊 Parsed ${data.length} event summary records`);
    return data;
  }

  async saveToDatabase(events, registrations) {
    console.log('💾 Saving to MongoDB...');
    
    if (!this.mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    
    const client = new MongoClient(this.mongoUri);
    
    try {
      await client.connect();
      console.log('✅ Connected to MongoDB');
      const db = client.db();
      
      // Save events
      if (events.length > 0) {
        await db.collection('eventSummaries').deleteMany({});
        await db.collection('eventSummaries').insertMany(events);
        console.log(`✅ Saved ${events.length} events to eventSummaries collection`);
      } else {
        console.log('⚠️ No events to save');
      }
      
      // Save ticket holders to registrationDetails collection
      if (registrations.length > 0) {
        console.log(`🗑️ Clearing existing registrationDetails collection...`);
        const deleteResult = await db.collection('registrationDetails').deleteMany({});
        console.log(`🗑️ Deleted ${deleteResult.deletedCount} existing records`);
        
        console.log(`💾 Inserting ${registrations.length} ticket holder records...`);
        
        // Drop ALL existing indexes to avoid conflicts (except _id)
        try {
          const indexes = await db.collection('registrationDetails').indexes();
          for (const index of indexes) {
            if (index.name !== '_id_') {
              try {
                await db.collection('registrationDetails').dropIndex(index.name);
                console.log(`🗑️ Dropped existing index: ${index.name}`);
              } catch (dropError) {
                console.log(`ℹ️ Could not drop index ${index.name}: ${dropError.message}`);
              }
            }
          }
        } catch (error) {
          console.log('ℹ️ No existing indexes to drop or error listing indexes');
        }
        
        // Insert all records (MongoDB will use _id as unique identifier)
        await db.collection('registrationDetails').insertMany(registrations, { ordered: false });
        console.log(`✅ Saved ${registrations.length} ticket holders to registrationDetails collection`);
        
        // Don't create any unique indexes - let MongoDB handle uniqueness with _id
        console.log('ℹ️ Using MongoDB _id field for uniqueness (no custom indexes created)');
        
      } else {
        console.log('⚠️ No ticket holders to save');
      }
      
      // Update last fetch log
      await db.collection('fetchlogs').insertOne({
        type: 'github_actions_scrape',
        status: 'success',
        eventsCount: events.length,
        registrationsCount: registrations.length,
        timestamp: new Date(),
        duration: 0,
        source: 'github_actions',
        environment: 'production'
      });
      
      console.log('✅ Fetch log updated');
      
    } catch (error) {
      console.error('❌ Database error:', error);
      
      // Log the failure
      try {
        const db = client.db();
        await db.collection('fetchlogs').insertOne({
          type: 'github_actions_scrape',
          status: 'error',
          error: error.message,
          eventsCount: events.length,
          registrationsCount: registrations.length,
          timestamp: new Date(),
          source: 'github_actions',
          environment: 'production'
        });
      } catch (logError) {
        console.error('❌ Failed to log error:', logError);
      }
      
      throw error;
    } finally {
      await client.close();
      console.log('✅ MongoDB connection closed');
    }
  }

  parseRegistrationData(htmlContent) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(htmlContent);
    const data = [];
    
    console.log('📝 Parsing registration data from HTML response...');
    console.log('📊 HTML content length:', htmlContent.length);
    
    // Look for tables containing registration data with specific headers
    const tables = $('table');
    console.log(`🔍 Found ${tables.length} tables in the response`);
    let dataTable = null;
    
    // Find the table with Cinema_Name, Event_Name headers (from the actual response)
    tables.each((i, table) => {
      const headerText = $(table).text();
      console.log(`📋 Table ${i} text preview:`, headerText.substring(0, 200));
      
      // Look for the specific columnwise registration data table with exact headers
      if (headerText.includes('Cinema_Name') && 
          headerText.includes('first_name') && 
          headerText.includes('primary_phoneNo')) {
        console.log(`✅ Found registration data table at index ${i}`);
        dataTable = $(table);
        return false; // break
      }
    });
    
    if (!dataTable) {
      console.log('⚠️ Registration data table not found, checking for any table with data...');
      // Fallback: look for any table with multiple rows
      tables.each((i, table) => {
        const rows = $(table).find('tr');
        if (rows.length > 2) { // Header + at least one data row
          console.log(`📋 Checking table ${i} with ${rows.length} rows`);
          dataTable = $(table);
          return false;
        }
      });
    }
    
    if (!dataTable) {
      console.log('❌ No suitable registration data table found');
      return data;
    }
    
    console.log('✅ Found registration data table, parsing rows...');
    
    // Parse table rows
    const rows = dataTable.find('tr');
    console.log(`📊 Found ${rows.length} rows in data table`);
    
    // Find header row (look for th elements or first tr)
    let headerRowIndex = 0;
    rows.each((i, row) => {
      const thCells = $(row).find('th');
      if (thCells.length > 0) {
        headerRowIndex = i;
        console.log('📋 Found header row at index:', i);
        console.log('📋 Headers:', thCells.map((j, cell) => $(cell).text().trim()).get());
        return false;
      }
    });
    
    // Parse data rows (skip header)
    rows.each((i, row) => {
      if (i <= headerRowIndex) return; // Skip header row(s)
      
      const cells = $(row).find('td');
      console.log(`📋 Row ${i}: ${cells.length} cells`);
      
      if (cells.length >= 45) { // Need at least 45 columns based on reponse.html structure
        try {
          const firstName = $(cells[20]).text().trim(); // first_name
          const lastName = $(cells[21]).text().trim(); // last_name
          const primaryPhoneNo = $(cells[24]).text().trim(); // primary_phoneNo
          const transDateStr = $(cells[4]).text().trim(); // Trans_Date
          const transId = $(cells[2]).text().trim(); // Trans_Id
          const ticketAmt = this.parseNumber($(cells[11]).text()) || 0; // Ticket_Amt
          const itemDesc = $(cells[12]).text().trim(); // Item_Desc
          
          const customerName = `${firstName} ${lastName}`.trim();
          
          console.log(`📋 Parsing row ${i}: ${customerName}, ${primaryPhoneNo}, ${itemDesc}, Reg: ${transDateStr}`);
          
          const record = {
            customerName: customerName,
            phone: primaryPhoneNo,
            transDate: transDateStr,
            registrationId: transId,
            amount: ticketAmt,
            ticketType: itemDesc || 'Festival Pass'
          };
          
          // Only add records with valid customer names
          if (customerName && customerName.length > 2 && customerName !== ' ') {
            data.push(record);
            console.log(`✅ Added registration: ${customerName}`);
          }
          
        } catch (error) {
          console.warn(`⚠️ Error parsing registration row ${i}:`, error);
        }
      }
    });
    
    console.log(`📊 Parsed ${data.length} registration records`);
    return data;
  }

  parseEventSummaryData(htmlContent) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(htmlContent);
    const data = [];
    
    // Find the main data table
    const tables = $('table');
    let dataTable = null;
    
    // Look for the table with event data
    tables.each((i, table) => {
      const headerText = $(table).text();
      if (headerText.includes('Event Name') && headerText.includes('Show Date')) {
        dataTable = $(table);
        return false; // break
      }
    });
    
    if (!dataTable) {
      console.log('⚠️ Event summary data table not found');
      return data;
    }
    
    // Parse table rows (skip header and total rows)
    const rows = dataTable.find('tr');
    
    rows.each((i, row) => {
      const cells = $(row).find('td');
      
      if (cells.length >= 21 && !$(row).text().includes('Total :')) {
        const record = {
          eventName: $(cells[0]).text().trim(),
          showDate: new Date($(cells[1]).text().trim()),
          location: $(cells[2]).text().trim(),
          venue: 'Jio World Garden, BKC: Mumbai',
          capacity: this.parseNumber($(cells[3]).text()),
          killed: this.parseNumber($(cells[4]).text()),
          otherSeat: this.parseNumber($(cells[5]).text()),
          reserveSeat: this.parseNumber($(cells[6]).text()),
          specialSeat: this.parseNumber($(cells[7]).text()),
          availableForSale: this.parseNumber($(cells[8]).text()),
          ticketSold: this.parseNumber($(cells[9]).text()),
          soldAmount: this.parseNumber($(cells[10]).text()),
          debtorDiscAmount: this.parseNumber($(cells[11]).text()),
          netSoldAmount: this.parseNumber($(cells[12]).text()),
          compQty: this.parseNumber($(cells[13]).text()),
          compAmount: this.parseNumber($(cells[14]).text()),
          unpaidCOD: this.parseNumber($(cells[15]).text()),
          unpaidQty: this.parseNumber($(cells[16]).text()),
          totalOffLoadedQty: this.parseNumber($(cells[17]).text()),
          totalOffLoadedAmount: this.parseNumber($(cells[18]).text()),
          socialDistancingCount: this.parseNumber($(cells[19]).text()),
          available: this.parseNumber($(cells[20]).text())
        };
        
        data.push(record);
      }
    });
    
    return data;
  }

  parseNumber(text) {
    return parseFloat(text.replace(/,/g, '').trim()) || 0;
  }

  parseDate(dateStr) {
    if (!dateStr || dateStr.trim() === '') return null;
    
    try {
      // Try to parse various date formats that might come from BMS
      const cleaned = dateStr.trim();
      
      // Handle formats like "17-09-2025 20:54:18" or "Dec 6 2025 2:00PM"
      const date = new Date(cleaned);
      if (!isNaN(date.getTime())) {
        return date;
      }
      
      // Try parsing DD-MM-YYYY HH:MM:SS format specifically
      const ddmmyyyyMatch = cleaned.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (ddmmyyyyMatch) {
        const [, day, month, year, hour, minute, second] = ddmmyyyyMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second));
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to parse date:', dateStr, error);
      return null;
    }
  }

  extractProtectedEmail(emailHtml) {
    if (!emailHtml || emailHtml.trim() === '') return '';
    
    // Handle Cloudflare protected emails like [email protected]
    if (emailHtml.includes('[email&#160;protected]')) {
      return '[email protected]'; // Placeholder for protected emails
    }
    
    // Extract plain email if it's not protected
    const emailMatch = emailHtml.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      return emailMatch[1];
    }
    
    return emailHtml.trim();
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      console.log('✅ Browser closed');
    }
  }

  async run() {
    const startTime = Date.now();
    
    try {
      console.log('🚀 Starting BMS scraper...');
      
      await this.initBrowser();
      await this.login();
      
      // Run scraping sequentially to avoid page navigation conflicts
      console.log('📊 Starting event summary scraping...');
      const events = await this.scrapeEventSummary();
      
      console.log('📋 Starting registration details scraping...');
      const registrations = await this.scrapeRegistrationDetails();
      
      await this.saveToDatabase(events, registrations);
      
      const duration = Date.now() - startTime;
      console.log(`✅ Scraping completed in ${duration}ms`);
      console.log(`📊 Events: ${events.length}, Ticket Holders: ${registrations.length}`);
      
    } catch (error) {
      console.error('❌ Scraping failed:', error);
      process.exit(1);
    } finally {
      await this.closeBrowser();
    }
  }
}

// Run the scraper
if (require.main === module) {
  const { calculateDashboardStats } = require('./calculate-stats');
  
  const scraper = new BMSScraper();
  scraper.run().then(async () => {
    console.log('🎉 Scraper finished successfully');
    
    // Calculate and save dashboard stats
    console.log('\n📊 Calculating dashboard statistics...');
    try {
      await calculateDashboardStats();
      console.log('✅ Dashboard stats calculated and saved');
    } catch (error) {
      console.error('❌ Failed to calculate dashboard stats:', error);
      // Don't fail the scraper if stats calculation fails
    }
    
    process.exit(0);
  }).catch(error => {
    console.error('💥 Scraper crashed:', error);
    process.exit(1);
  });
}

module.exports = BMSScraper;
