import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import os from 'os';

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3333;
const CONCURRENCY_LIMIT = parseInt(process.env.CONCURRENCY_LIMIT) || 2;
const MAPS_CONCURRENCY_LIMIT = 1;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// In-memory job store
const jobs = new Map();

// Platform-aware launch flags
const IS_LINUX = os.platform() === 'linux';
const CHROME_FLAGS = [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-service-autorun',
    '--password-store=basic'
];

if (IS_LINUX) {
    CHROME_FLAGS.push('--no-sandbox', '--disable-setuid-sandbox');
}

// Regex patterns
const PHONE_REGEX = /(?:(?:\+|00)[1-9]\d{6,14})|(?:0[789][01]\d{8})/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Normalizes and ranks phone numbers, prioritizing Nigerian formats.
 */
function processPhones(phones) {
    if (!phones || phones.length === 0) return [];
    const unique = [...new Set(phones.map(p => p.trim()))];
    
    return unique.sort((a, b) => {
        const isANigerian = a.startsWith('+234') || a.startsWith('0');
        const isBNigerian = b.startsWith('+234') || b.startsWith('0');
        if (isANigerian && !isBNigerian) return -1;
        if (!isANigerian && isBNigerian) return 1;
        return 0;
    });
}

/**
 * Core scraping logic for a single lead.
 */
async function scrapeLead(lead, browser) {
    const { url, name } = lead;
    const result = {
        name,
        originalUrl: url,
        phone: null,
        email: null,
        contactPage: null,
        website: url,
        status: 'failed'
    };

    if (!url || url === 'None' || url === '') {
        result.status = 'skipped';
        return result;
    }

    let page;
    try {
        // Mandatory wait to prevent rate limits (3.5s buffer for Free Tier)
        await sleep(3500);
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
        await page.setDefaultNavigationTimeout(30000);

        const isMaps = url.includes('google.com/maps') || url.includes('maps.app.goo.gl');

        if (isMaps) {
            console.log(`[Maps] Scraping: ${name}`);
            await page.goto(url, { waitUntil: 'networkidle2' });
            
            try {
                // Strategy 1: Look for explicit action buttons (Phone/Call/Copy)
                const selectors = [
                    'button[aria-label^="Phone:"]',
                    'button[aria-label^="Call:"]',
                    'button[data-tooltip="Copy phone number"]',
                    'button[data-item-id="oloc"]', // Overflow phone button
                    '[data-section-id="pn0"]' // Specific phone section
                ];
                
                for (const selector of selectors) {
                    const btn = await page.$(selector);
                    if (btn) {
                        const label = await page.evaluate(el => el.getAttribute('aria-label') || el.innerText, btn);
                        const match = label.match(/\+?[0-9][0-9\s\-]{7,15}/);
                        if (match) {
                            result.phone = match[0].trim();
                            break;
                        }
                    }
                }

                // Strategy 2: Broad Text Scan (Fallback) - Look for Nigerian phone patterns in the sidebar
                if (!result.phone) {
                    const sidebarText = await page.evaluate(() => {
                        const sidebar = document.querySelector('[role="main"]') || document.body;
                        return sidebar.innerText;
                    });
                    // Nigerian Phone Pattern: 080, 081, 070, 090 or +234
                    const phoneMatch = sidebarText.match(/(?:\+234|0)[789][01]\d{8}/);
                    if (phoneMatch) result.phone = phoneMatch[0].trim();
                }
            } catch (e) {
                console.log(`[Maps] Phone button not found for ${name}`);
            }
        } else {
            console.log(`[Web] Scraping: ${url}`);
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            
            // Extract from homepage
            const bodyContent = await page.evaluate(() => document.body.innerText);
            const bodyHtml = await page.evaluate(() => document.body.innerHTML);
            
            const phones = bodyContent.match(PHONE_REGEX) || [];
            const emails = bodyContent.match(EMAIL_REGEX) || [];
            
            // Look for tel: and mailto: links
            const hrefPhones = await page.evaluate(() => 
                Array.from(document.querySelectorAll('a[href^="tel:"]')).map(a => a.href.replace('tel:', ''))
            );
            const hrefEmails = await page.evaluate(() => 
                Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => a.href.replace('mailto:', ''))
            );

            result.phone = processPhones([...phones, ...hrefPhones])[0] || null;
            result.email = [...new Set([...emails, ...hrefEmails])][0] || null;

            // Detect contact page
            const contactUrl = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const contactLink = links.find(a => {
                    const text = a.innerText.toLowerCase();
                    return text.includes('contact') || text.includes('about') || text.includes('support');
                });
                return contactLink ? contactLink.href : null;
            });

            if (contactUrl && contactUrl !== url) {
                result.contactPage = contactUrl;
                console.log(`[Web] Found contact page: ${contactUrl}`);
                await page.goto(contactUrl, { waitUntil: 'domcontentloaded' });
                
                const cBody = await page.evaluate(() => document.body.innerText);
                const cPhones = cBody.match(PHONE_REGEX) || [];
                const cEmails = cBody.match(EMAIL_REGEX) || [];
                
                if (!result.phone) result.phone = processPhones(cPhones)[0] || null;
                if (!result.email) result.email = [...new Set(cEmails)][0] || null;
            }
        }

        result.status = 'success';
    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
        result.status = 'error';
        result.error = error.message;
    } finally {
        if (page) await page.close();
    }

    return result;
}

/**
 * Worker node that processes leads from the job queue.
 */
async function worker(job) {
    const isHeadless = process.env.HEADLESS !== 'false' ? 'new' : false;
    
    // Explicit path for Windows Chrome
    const executablePath = IS_LINUX 
        ? undefined 
        : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

    const browser = await puppeteer.launch({
        headless: isHeadless,
        executablePath: executablePath,
        args: CHROME_FLAGS
    });

    try {
        while (job.queue.length > 0) {
            const lead = job.queue.shift();
            const result = await scrapeLead(lead, browser);
            job.results.push(result);
            job.completed++;
            job.updatedAt = Date.now();
        }
    } finally {
        await browser.close();
    }
}

/**
 * Orchestrates the batch processing and triggers the callback.
 */
async function processBatch(jobId) {
    const job = jobs.get(jobId);
    if (!job) return;

    job.status = 'processing';
    
    const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, job.leads.length) }, () => worker(job));
    
    await Promise.all(workers);
    
    job.status = 'done';
    job.finishedAt = Date.now();
    console.log(`Job ${jobId} finished. ${job.completed}/${job.total} completed.`);

    if (job.callbackUrl) {
        try {
            console.log(`Sending callback to ${job.callbackUrl}`);
            await axios.post(job.callbackUrl, {
                jobId,
                status: job.status,
                results: job.results
            });
        } catch (err) {
            console.error(`Callback failed for job ${jobId}:`, err.message);
        }
    }
}

// --- API Endpoints ---

app.post('/enrich/batch', (req, res) => {
    const { leads, callbackUrl } = req.body;
    
    if (!leads || !Array.isArray(leads)) {
        return res.status(400).json({ error: 'leads must be an array' });
    }

    const jobId = uuidv4();
    const job = {
        id: jobId,
        status: 'pending',
        leads: leads,
        queue: [...leads],
        total: leads.length,
        completed: 0,
        results: [],
        callbackUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        finishedAt: null
    };

    jobs.set(jobId, job);
    
    // Start processing in background
    processBatch(jobId).catch(console.error);

    res.json({ jobId, status: 'pending', message: 'Batch queued' });
});

app.get('/enrich/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    res.json({
        jobId: job.id,
        status: job.status,
        progress: `${job.completed}/${job.total}`,
        results: job.results
    });
});

app.delete('/enrich/cancel/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    job.queue = []; // Empty the queue to stop further processing
    job.status = 'cancelled';
    res.json({ message: 'Job cancellation requested' });
});

// Clean up old jobs every 15 minutes
setInterval(() => {
    const ONE_HOUR = 60 * 60 * 1000;
    const now = Date.now();
    for (const [id, job] of jobs.entries()) {
        if (now - job.createdAt > ONE_HOUR) {
            jobs.delete(id);
        }
    }
}, 15 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`🚀 Lead Enrichment Server running on port ${PORT}`);
    console.log(`Platform: ${os.platform()} | Browser: ${IS_LINUX ? 'Headless' : 'Visible'}`);
});
