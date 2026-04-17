const botToken = '8520889170:AAGsXt_r0ghlqgzqmI6mPsHo6Y3hVpId3yk';

async function testTelegramBot() {
  try {
    // Get bot info
    const botInfo = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const botData = await botInfo.json();
    console.log('Bot Status:', JSON.stringify(botData, null, 2));
    
    // Get updates to see if messages are coming in
    const updates = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
    const updateData = await updates.json();
    console.log('Recent Updates:', JSON.stringify(updateData, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testTelegramBot();
