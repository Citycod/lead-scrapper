// Direct SerpApi search script
const SERPAPI_KEY = "a0c677640ca8c9c256299312efed0be1672a8fd6514aacd01c7101cfe6894f51";
const TELEGRAM_BOT_TOKEN = "8520889170:AAGsXt_r0ghlqgzqmI6mPsHo6Y3hVpId3yk";
const CHAT_ID = "6522998524";

async function searchBusinesses() {
  const niches = ["mechanic", "tailor", "electronics repair", "local food vendor", "cleaning service"];
  const locations = ["Enugu", "Delta", "Ogun", "Anambra", "Imo", "Ebonyi", "Rivers"];
  const businesses = [];  
  
  for (const niche of niches) {
    for (const location of locations) {
      // Try multiple search queries for better results
      const queries = [
        `${niche}+in+${location}`,
        `${niche}+near+${location}`,
        `${niche}+${location}+Nigeria`
      ];
      
      for (const query of queries) {
        const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}`;
        
        try {
          const response = await fetch(url);
          const data = await response.json();
          
          console.log(`Search results for ${query}:`, JSON.stringify(data, null, 2));
          
          if (data.organic_results && data.organic_results.length > 0) {
            for (const place of data.organic_results) {
              // Check if business has no website
              const hasWebsite = place.link && !place.link.includes('maps.google.com');
              console.log(`Place: ${place.title}, Has Website: ${hasWebsite}, Link: ${place.link}`);
              
              // Add ALL businesses to see the full picture
              businesses.push({
                name: place.title,
                address: place.address || `${location}, Nigeria`,
                niche: niche,
                phone: place.phone || 'N/A',
                website: hasWebsite ? place.link : 'None',
                date: new Date().toISOString().split('T')[0],
                status: 'New'
              });
            }
            break; // Found results, move to next location
          } else {
            console.log(`No organic results found for ${query}`);
          }
        } catch (error) {
          console.log(`Error searching ${niche} in ${location}:`, error.message);
        }
      }
    }
  }
  
  return businesses.slice(0, 5); // Return max 5 businesses
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

async function main() {
  console.log('🔍 Searching for businesses without websites...');
  
  const businesses = await searchBusinesses();
  
  if (businesses.length === 0) {
    await sendToTelegram('📊 <b>Search Complete</b>\n\nNo businesses without websites found in this search. Try expanding the search area or different niches.');
    return;
  }
  
  // Save to file for review
  const fs = require('fs');
  fs.writeFileSync('search-results.json', JSON.stringify(businesses, null, 2));
  console.log('💾 Results saved to search-results.json');
  
  let message = '🔍 <b>Business Search Results</b>\n\n';
  
  businesses.forEach((business, index) => {
    message += `📍 <b>${index + 1}. ${business.name}</b>\n`;
    message += `   🏢 ${business.niche}\n`;
    message += `   📍 ${business.address}\n`;
    message += `   📞 ${business.phone}\n`;
    message += `   🌐 <i>${business.website}</i>\n\n`;
  });
  
  const noWebsiteCount = businesses.filter(b => b.website === 'None').length;
  const totalWithWebsite = businesses.filter(b => b.website !== 'None').length;
  
  message += `📊 <b>Summary</b>\n`;
  message += `   🌐 With websites: ${totalWithWebsite}\n`;
  message += `   ❌ Without websites: ${noWebsiteCount}\n`;
  
  if (noWebsiteCount === 0) {
    message += `\n💡 <i>All found businesses already have websites! This could mean:</i>\n`;
    message += `   • High internet penetration in these areas\n`;
    message += `   • Consider targeting different business types\n`;
    message += `   • Try smaller towns or different niches\n`;
  } else {
    message += `\n🎯 <i>Great! Found ${noWebsiteCount} businesses without websites - perfect leads for web design services!</i>\n`;
  }
  
  await sendToTelegram(message);
  console.log(`Found ${businesses.length} total businesses, ${noWebsiteCount} without websites`);
}

main().catch(console.error);
