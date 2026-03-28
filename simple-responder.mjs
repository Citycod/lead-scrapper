// Simple fallback responder for when AI APIs are rate limited
const TELEGRAM_BOT_TOKEN = "8520889170:AAGsXt_r0ghlqgzqmI6mPsHo6Y3hVpId3yk";
const N8N_WEBHOOK_URL = "http://localhost:5678/webhook/lead-scan";

const responses = {
  "run a scan now": "🔍 Scan triggered! You'll get results in a few minutes.",
  "how many leads today": "📊 Checking today's leads... Please check your Google Sheets for the latest count.",
  "show me leads": "📋 Please check your Google Sheets for the latest leads.",
  "help": "🤖 Available commands:\n• 'Run a scan now' - Trigger lead scan\n• 'How many leads today' - Check today's count\n• 'Show me leads' - View latest leads\n• 'Help' - Show this message",
  "default": "🤖 I'm currently experiencing API rate limits. Please try again later or use the n8n dashboard at http://localhost:5678"
};

async function handleUpdate(update) {
  if (!update.message) return;
  
  const chatId = update.message.chat.id;
  const text = update.message.text?.toLowerCase() || "";
  
  let response = responses.default;
  
  // Check for specific commands
  for (const [command, reply] of Object.entries(responses)) {
    if (command !== "default" && text.includes(command)) {
      response = reply;
      
      // Trigger n8n webhook for scan command
      if (command === "run a scan now") {
        try {
          await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trigger: 'manual', source: 'telegram' })
          });
        } catch (error) {
          console.log('Failed to trigger n8n:', error.message);
        }
      }
      break;
    }
  }
  
  // Send response
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: response
    })
  });
}

// Test the responder
console.log("🤖 Simple responder ready - API rate limited mode");
console.log("Available commands:", Object.keys(responses).filter(k => k !== 'default').join(", "));
