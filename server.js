require('dotenv').config();
const express = require('express');
const cors = require('cors');

const connectDB = require('./config/db');               // ✅ default export (matches your db.js)
const { startRecurrenceCron } = require('./services/recurrenceEngine');
const { initRealtime } = require('./services/realtime');
const { startDebtReminderCron } = require('./services/reminderService');
const http = require('http');

const app = express();
const server = http.createServer(app);

// Basic middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS (allow Vite dev + optional APP_URL)
const allowOrigin = [
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  'http://localhost:5173'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowOrigin.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Basic hardening headers
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Routes
const authRoutes = require('./routes/authRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const chatRoutes = require('./routes/chatRoutes');
const userRoutes = require('./routes/userRoutes');
const recurringRoutes = require('./routes/recurringRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const jarRoutes = require('./routes/jarRoutes');
const goalRoutes = require('./routes/goalRoutes');
const debtRoutes = require('./routes/debtRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/income', incomeRoutes);
app.use('/api/v1/expense', expenseRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/recurring', recurringRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/jars', jarRoutes);
app.use('/api/v1/goals', goalRoutes);
app.use('/api/v1/debts', debtRoutes);
app.use('/api/v1/notifications', notificationRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8000;

// ✅ Connect DB first, then start HTTP and recurrence cron
connectDB()
  .then(() => {
    initRealtime(server);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${PORT}`);
    });
    try {
      startRecurrenceCron();                         // start hourly tick AFTER DB is ready
      console.log('[recurrence] hourly tick armed');
    } catch (e) {
      console.warn('recurrence start skipped:', e?.message || e);
    }
    try {
      startDebtReminderCron();
      console.log('[debt-reminders] cron armed');
    } catch (e) {
      console.warn('debt reminder start skipped:', e?.message || e);
    }
  })
  .catch((err) => {
    console.error('Failed to connect DB:', err?.message || err);
    process.exit(1);
  });
