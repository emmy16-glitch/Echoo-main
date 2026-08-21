import 'dotenv/config';
import LiveKitProvider from '../backend/src/providers/livekit.js';

async function test() {
  console.log('--- LiveKit Diagnostic ---');
  console.log('URL:', process.env.LIVEKIT_URL);
  console.log('API Key:', process.env.LIVEKIT_API_KEY);
  
  try {
    const health = await LiveKitProvider.checkHealth();
    console.log('\n✅ SUCCESS: LiveKit is reachable and credentials are valid.');
    console.log('Details:', JSON.stringify(health, null, 2));
  } catch (error) {
    console.error('\n❌ FAILED: LiveKit connection failed.');
    console.error('Error Code:', error.code);
    console.error('Message:', error.message);
    
    if (error.message.includes('invalid token')) {
      console.error('\nTIP: Your API Secret likely does not match your API Key. Revoke the key in the LiveKit dashboard and create a new one.');
    } else if (error.message.includes('not configured')) {
      console.error('\nTIP: Make sure you have copied .env.ngrok.example to .env and filled in the values.');
    }
    
    process.exit(1);
  }
}

test();
