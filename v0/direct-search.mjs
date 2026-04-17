import fs from 'fs';
import path from 'path';

// Simple .env loader
const envPath = path.join(process.cwd(), '.env');
const envConfig = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const env = {};
envConfig.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const SERPER_API_KEY = env.SERPER_API_KEY;
const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = env.TELEGRAM_CHAT_ID;
const AI_API_KEY = env.AI_API_KEY;

// Utility for delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getContactInfo(name, location) {
  if (!AI_API_KEY) return { email: 'Missing AI Key', phone: null, facebook: null, instagram: null };
  
  console.log(`🔍 Deep searching for ${name} contact info...`);
  const query = `${name} ${location} contact email facebook instagram`;
  
  try {
    const searchResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query })
    });
    const searchData = await searchResponse.json();
    
    // Check Knowledge Graph first for phone
    let foundPhone = searchData.knowledgeGraph?.attributes?.Phone || searchData.knowledgeGraph?.attributes?.phone;
    
    const snippets = searchData.organic?.map(r => `${r.title}: ${r.snippet}`).join('\n') || '';

    // Use v1beta with gemini-2.0-flash-lite (newest stable model for some keys)
    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${AI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Extract the business email, contact phone number, and social media links (Facebook, Instagram) from these search results for the business "${name}". 
            
            IMPORTANT:
            - If you find a phone number, return it.
            - If you find an email, return it.
            - Return ONLY a valid JSON object like:
            {"email": "string or null", "phone": "string or null", "facebook": "url or null", "instagram": "url or null"}
            
            Search Results:
            ${snippets}`
          }]
        }]
      })
    });
    
    if (aiResponse.status === 429) {
      console.warn(`⚠️ Rate limit hit for ${name}. Skipping AI extraction.`);
      return { email: null, phone: foundPhone || null, facebook: null, instagram: null };
    }

    const aiData = await aiResponse.json();
    
    let aiResult = { email: null, phone: null, facebook: null, instagram: null };
    
    if (aiData.error) {
      console.warn(`AI Error for ${name}:`, aiData.error.message);
    } else {
        const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`🤖 AI Response for ${name}:`, text);
        const jsonStr = text?.match(/\{[\s\S]*\}/)?.[0] || '{}';
        try {
            aiResult = JSON.parse(jsonStr);
        } catch (e) {
            console.error(`Failed to parse AI JSON for ${name}:`, text);
        }
    }
    
    // --- ROBUST FALLBACKS (Regex) ---
    // If phone is missing from AI/KG, look in snippets
    const phoneRegex = /(\+234|0)[789][01]\d{8}/g; // Nigerian phone format
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    
    const foundPhones = snippets.match(phoneRegex) || [];
    const foundEmails = snippets.match(emailRegex) || [];
    
    const finalPhone = foundPhone || aiResult.phone || foundPhones[0] || null;
    const finalEmail = aiResult.email || foundEmails[0] || null;
    
    // Social regex
    const fbRegex = /facebook\.com\/[a-zA-Z0-9.]+/;
    const igRegex = /instagram\.com\/[a-zA-Z0-9._]+/;
    const foundFB = snippets.match(fbRegex);
    const foundIG = snippets.match(igRegex);

    return {
      email: finalEmail,
      phone: finalPhone,
      facebook: aiResult.facebook || (foundFB ? `https://${foundFB[0]}` : null),
      instagram: aiResult.instagram || (foundIG ? `https://${foundIG[0]}` : null)
    };
  } catch (error) {
    console.error(`Error enriching ${name}:`, error.message);
    return { email: null, phone: null, facebook: null, instagram: null };
  }
}

async function searchBusinesses() {
  const niches = (env.NICHES || "restaurant").split(',').map(n => n.trim());
  const locations = (env.LOCATIONS || "Abuja").split(',').map(l => l.trim());
  const businesses = [];  
  
  for (const niche of niches) {
    for (const location of locations) {
      // Try multiple search queries for better results
      const queries = [
        `${niche} in ${location}`,
        `${niche} near ${location}`,
        `${niche} ${location} Nigeria`
      ];
      
      for (const query of queries) {
        const url = 'https://google.serper.dev/places';
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'X-API-KEY': SERPER_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ q: query })
          });
          const data = await response.json();
          
          console.log(`Search results for ${query}:`, JSON.stringify(data, null, 2));
          if (data.places && data.places.length > 0) {
            console.log('Sample Place Object:', JSON.stringify(data.places[0], null, 2));
          }
          
          if (data.places && data.places.length > 0) {
            for (const place of data.places) {
              const hasWebsite = !!(place.website && place.website.length > 5);
              const mapsUrl = place.cid ? `https://www.google.com/maps?cid=${place.cid}` : `https://www.google.com/search?q=${encodeURIComponent(place.title + ' ' + location)}`;
              
              console.log(`Place found: ${place.title} | Website: ${hasWebsite ? 'Yes' : 'No'}`);
              
              const phone = place.phoneNumber || place.phone || 'N/A';
              
              businesses.push({
                name: place.title,
                address: place.address || `${location}, Nigeria`,
                niche: niche,
                phone: phone,
                website: hasWebsite ? place.website : 'None',
                mapsUrl: mapsUrl, // Pass this to Puppeteer
                rating: place.rating || 'N/A',
                reviews: place.ratingCount || 0,
                cid: place.cid,
                date: new Date().toISOString().split('T')[0],
                status: 'New'
              });
            }
            break; // Found results for this niche/location, move to next
          } else {
            console.log(`No places found for ${query}`);
          }
        } catch (error) {
          console.log(`Error searching ${niche} in ${location}:`, error.message);
        }
      }
    }
  }
  
  return businesses; // Return ALL results
}

async function sendToTelegram(message) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });
    console.log('Message sent to Telegram');
  } catch (error) {
    console.error('Error sending to Telegram:', error.message);
  }
}

async function enrichLeads(leads) {
  const serverUrl = env.ENRICHMENT_SERVER_URL || 'http://localhost:3333/enrich';
  console.log(`🚀 Sending ${leads.length} leads to enrichment server...`);
  
  try {
    const batchResponse = await fetch(`${serverUrl}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leads: leads.map(l => ({ name: l.name, url: l.website !== 'None' ? l.website : l.mapsUrl }))
      })
    });
    
    const { jobId } = await batchResponse.json();
    console.log(`⏳ Job created: ${jobId}. Waiting for results...`);
    
    while (true) {
      await sleep(5000);
      const statusResponse = await fetch(`${serverUrl}/status/${jobId}`);
      const statusData = await statusResponse.json();
      
      process.stdout.write(`\r📊 Progress: ${statusData.progress} leads completed...`);
      
      if (statusData.status === 'done') {
        console.log('\n✅ Enrichment complete!');
        return statusData.results;
      }
      
      if (statusData.status === 'failed' || statusData.status === 'error') {
        console.error('\n❌ Enrichment job failed.');
        return [];
      }
    }
  } catch (error) {
    console.error('Error calling enrichment server:', error.message);
    return [];
  }
}

async function main() {
  console.log('🔍 Searching for businesses...');
  
  let businesses = await searchBusinesses();
  
  if (businesses.length === 0) {
    await sendToTelegram('📊 <b>Search Complete</b>\n\nNo businesses found. Try expanding the search area or different niches.');
    return;
  }
  
  // 1. Enrich leads using Puppeteer
  const enrichedResults = await enrichLeads(businesses);
  
  // 2. Merge results
  businesses = businesses.map(b => {
    const enriched = enrichedResults.find(e => e.name === b.name);
    if (enriched) {
      return {
        ...b,
        phone: enriched.phone || b.phone,
        email: enriched.email || 'None found',
        contactPage: enriched.contactPage
      };
    }
    return b;
  });

  // 3. Smart AI Fallback: Only for leads where Puppeteer found nothing
  console.log('🤖 Checking for leads needing AI fallback...');
  for (let biz of businesses) {
    if (biz.phone === 'N/A' || biz.email === 'None found') {
      console.log(`✨ AI Fallback for: ${biz.name}...`);
      try {
        const aiInfo = await getContactInfo(biz.name, biz.address);
        biz.phone = (biz.phone === 'N/A' && aiInfo.phone) ? aiInfo.phone : biz.phone;
        biz.email = (biz.email === 'None found' && aiInfo.email) ? aiInfo.email : biz.email;
        biz.facebook = aiInfo.facebook || biz.facebook;
        biz.instagram = aiInfo.instagram || biz.instagram;
        
        // Mandatory wait to prevent rate limits (3.5s buffer)
        await sleep(3500); 
      } catch (err) {
        console.log(`⚠️ AI skipped for ${biz.name}: ${err.message}`);
      }
    }
  }
  
  // Save to file for review
  fs.writeFileSync('search-results.json', JSON.stringify(businesses, null, 2));
  console.log('💾 Results saved to search-results.json');
  
  let message = '🚀 <b>Deep-Enriched Business Results</b>\n\n';
  
  businesses.forEach((business, index) => {
    const mapsUrl = business.cid ? `https://www.google.com/maps?cid=${business.cid}` : '#';
    message += `🔹 <b>${index + 1}. <a href="${mapsUrl}">${business.name}</a></b>\n`;
    message += `   📂 <i>${business.niche}</i>\n`;
    message += `   📍 ${business.address}\n`;
    message += `   📞 <code>${business.phone}</code>\n`;
    message += `   📧 <b>Email:</b> ${business.email}\n`;
    if (business.contactPage) {
      message += `   🔗 <a href="${business.contactPage}">Contact Page Found</a>\n`;
    }
    message += `   ⭐ ${business.rating} (${business.reviews} reviews)\n\n`;
  });
  
  const noWebsiteCount = businesses.filter(b => b.website === 'None').length;
  const totalWithWebsite = businesses.filter(b => b.website !== 'None').length;
  
  message += `📊 <b>Summary</b>\n`;
  message += `   🌐 With websites: ${totalWithWebsite}\n`;
  message += `   ❌ Without websites: ${noWebsiteCount}\n`;
  message += `\n🎯 <i>Found ${businesses.length} leads with high-accuracy contact data.</i>\n`;
  
  await sendToTelegram(message);
  console.log(`Found ${businesses.length} total businesses, enriched via Puppeteer + AI Fallback.`);
}

main().catch(console.error);
