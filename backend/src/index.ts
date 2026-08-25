import { createApp } from './adapters/http/app.js';
import { config } from './config/env.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`[backend] listening on :${config.port} (${config.nodeEnv})`);
  console.log(`[backend] razorpay: ${config.razorpay.isConfigured() ? 'TEST keys configured' : 'NOT configured — set rzp_test_ keys in .env'}`);
});
