import requests
import json
import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SERPER_API_KEY = os.getenv("SERPER_API_KEY", "4aca297c0acbff6fa9d6c89e18395fca6bcc828b")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "YOUR_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "YOUR_CHAT_ID")

def search_businesses():
    niches = ["mechanic", "tailor", "electronics repair", "local food vendor", "cleaning service"]
    locations = ["Enugu", "Delta", "Ogun", "Anambra", "Imo", "Ebonyi", "Rivers"]
    businesses = []
    
    for niche in niches:
        for location in locations:
            # Multiple search queries for better results
            queries = [
                f"{niche} in {location}",
                f"{niche} near {location}",
                f"{niche} {location} Nigeria"
            ]
            
            for query in queries:
                url = "https://google.serper.dev/places"
                headers = {
                    "X-API-KEY": SERPER_API_KEY,
                    "Content-Type": "application/json"
                }
                payload = json.dumps({"q": query})
                
                try:
                    response = requests.post(url, headers=headers, data=payload)
                    data = response.json()
                    
                    results = data.get("places", [])
                    
                    if results:
                        print(f"Found {len(results)} results for {query}")
                        for place in results:
                            # Check if business has no website
                            # In Serper Places, website is in 'website' field
                            website = place.get("website", "")
                            has_website = bool(website) and len(website) > 5
                            
                            businesses.append({
                                "name": place.get("title") or place.get("name") or "Unknown",
                                "address": place.get("address") or f"{location}, Nigeria",
                                "niche": niche,
                                "phone": place.get("phoneNumber") or "N/A",
                                "website": website if has_website else "None",
                                "date": datetime.datetime.now().strftime("%Y-%m-%d"),
                                "status": "New"
                            })
                        break # Found results for this location, move to next
                except Exception as e:
                    print(f"Error searching {niche} in {location}: {str(e)}")
                    
    return businesses[:10] # Return max 10 for demonstration

def send_to_telegram(message):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML"
    }
    try:
        requests.post(url, json=payload)
        print("Message sent to Telegram")
    except Exception as e:
        print(f"Error sending to Telegram: {str(e)}")

def main():
    print("🔍 Searching for businesses without websites (Python version)...")
    
    businesses = search_businesses()
    
    if not businesses:
        send_to_telegram("📊 <b>Search Complete</b>\n\nNo businesses without websites found. Try expanding the search area.")
        return
        
    # Save to file
    with open("search-results-python.json", "w") as f:
        json.dump(businesses, f, indent=2)
    print("💾 Results saved to search-results-python.json")
    
    message = "🔍 <b>Business Search Results (Python)</b>\n\n"
    
    for i, biz in enumerate(businesses):
        message += f"📍 <b>{i+1}. {biz['name']}</b>\n"
        message += f"   🏢 {biz['niche']}\n"
        message += f"   📍 {biz['address']}\n"
        message += f"   📞 {biz['phone']}\n"
        message += f"   🌐 <i>{biz['website']}</i>\n\n"
        
    no_website_count = len([b for b in businesses if b["website"] == "None"])
    total_with_website = len(businesses) - no_website_count
    
    message += "📊 <b>Summary</b>\n"
    message += f"   🌐 With websites: {total_with_website}\n"
    message += f"   ❌ Without websites: {no_website_count}\n"
    
    if no_website_count > 0:
        message += f"\n🎯 <i>Great! Found {no_website_count} leads for web design services!</i>\n"
        
    send_to_telegram(message)
    print(f"Found {len(businesses)} total businesses, {no_website_count} without websites")

if __name__ == "__main__":
    main()
