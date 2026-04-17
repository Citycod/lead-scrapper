const botToken = '8520889170:AAGsXt_r0ghlqgzqmI6mPsHo6Y3hVpId3yk';

async function testBot() {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();
    console.log('Bot Status:', JSON.stringify(data, null, 2));
    
    // Send test message
    const sendMessage = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: 6522998524,
        text: '🤖 Groq API configured! System is now ready. Try commands like:\n• "Run a scan now"\n• "How many leads today"\n• "Help"\n\nNote: All APIs are currently rate limited, but infrastructure is ready!'
      })
    });
    const msgResult = await sendMessage.json();
    console.log('Message sent:', JSON.stringify(msgResult, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testBot();
