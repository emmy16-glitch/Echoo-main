import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendPath = join(__dirname, '..', 'backend');

// Manually load env from backend/.env to avoid dependency issues in root
function loadEnv() {
  const envPath = join(backendPath, '.env');
  if (!fs.existsSync(envPath)) {
    console.error(`❌ FAILED: .env file not found at ${envPath}`);
    process.exit(1);
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

loadEnv();

// Dynamically import the provider from the backend
const providerPath = join(backendPath, 'src', 'providers', 'livekit.js');
const { default: LiveKitProvider } = await import(providerPath);

async function test() {
  console.log('--- Echoo LiveKit Diagnostic ---');
  console.log('URL:', process.env.LIVEKIT_URL);
  console.log('API Key:', process.env.LIVEKIT_API_KEY);
  console.log('------------------------------');
  
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
