import express from 'express';
import Stripe from 'stripe';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(cors());
app.use(express.static('.'));

// IP Detection and Country Info
app.get('/api/ip-info', async (req, res) => {
    try {
        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        const response = await fetch(`http://ip-api.com/json/${clientIP}`);
        const data = await response.json();
        
        // Add proper error handling and fallback values
        const countryCode = data.countryCode || 'US';
        const flag = `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`;
        
        res.json({
            ip: clientIP,
            country: data.country || 'United States',
            countryCode: countryCode,
            region: data.region || 'Unknown',
            city: data.city || 'Unknown',
            timezone: data.timezone || 'UTC',
            flag: flag
        });
    } catch (error) {
        console.error('IP detection error:', error);
        res.json({
            ip: 'Unknown',
            country: 'United States',
            countryCode: 'US',
            region: 'Unknown',
            city: 'Unknown',
            timezone: 'UTC',
            flag: 'https://flagcdn.com/w40/us.png'
        });
    }
});

// Database simulation (in production, use a real database)
let userData = [];

// Save user data
app.post('/api/save-user', async (req, res) => {
    try {
        const userInfo = {
            id: Date.now().toString(),
            ...req.body,
            timestamp: new Date().toISOString(),
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip
        };
        
        userData.push(userInfo);
        console.log('User data saved:', userInfo);
        
        res.json({ success: true, userId: userInfo.id });
    } catch (error) {
        console.error('Save user error:', error);
        res.status(500).json({ error: 'Failed to save user data' });
    }
});

// Get user data
app.get('/api/users', (req, res) => {
    res.json(userData);
});

// Webhook endpoint - must be before express.json()
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('Payment succeeded:', paymentIntent.id);
      // Update user data with payment info
      const userIndex = userData.findIndex(user => user.email === paymentIntent.metadata.email);
      if (userIndex !== -1) {
        userData[userIndex].paymentStatus = 'completed';
        userData[userIndex].paymentId = paymentIntent.id;
      }
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('Payment failed:', failedPayment.id);
      break;
    case 'customer.subscription.created':
      const subscription = event.data.object;
      console.log('Subscription created:', subscription.id);
      break;
    case 'customer.subscription.updated':
      const updatedSubscription = event.data.object;
      console.log('Subscription updated:', updatedSubscription.id);
      break;
    case 'customer.subscription.deleted':
      const deletedSubscription = event.data.object;
      console.log('Subscription cancelled:', deletedSubscription.id);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// JSON middleware for other routes
app.use(express.json());

// Create payment intent
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'inr', planName, customerEmail, customerName } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Amount in paise (₹19,999 = 1999900)
      currency,
      metadata: {
        plan: planName,
        email: customerEmail,
        name: customerName
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).send({ error: error.message });
  }
});

// Create subscription
app.post('/create-subscription', async (req, res) => {
  try {
    const { priceId, customerEmail, customerName } = req.body;

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: customerEmail,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customerEmail,
        name: customerName
      });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    res.send({
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).send({ error: error.message });
  }
});

// Get subscription status
app.get('/subscription-status/:subscriptionId', async (req, res) => {
  try {
    const subscription = await stripe.subscriptions.retrieve(req.params.subscriptionId);
    res.send({
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    res.status(500).send({ error: error.message });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`IP Info endpoint: http://localhost:${PORT}/api/ip-info`);
});