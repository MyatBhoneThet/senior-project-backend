require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/db');               // ✅ default export (matches your db.js)
const { startRecurrenceCron } = require('./services/recurrenceEngine');

const app = express();

// Basic middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS (allow Vite dev + optional APP_URL)
const allowOrigin = 'http://localhost:5173';
app.use(cors({ origin: allowOrigin, credentials: false }));

// COOP for charts/popups
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// Routes
const authRoutes        = require('./routes/authRoutes');
const incomeRoutes      = require('./routes/incomeRoutes');
const expenseRoutes     = require('./routes/expenseRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const categoryRoutes    = require('./routes/categoryRoutes');
const dashboardRoutes   = require('./routes/dashboardRoutes');
const chatRoutes        = require('./routes/chatRoutes');
const userRoutes        = require('./routes/userRoutes');
const recurringRoutes   = require('./routes/recurringRoutes');
const analyticsRoutes   = require('./routes/analyticsRoutes');
const jarRoutes        = require('./routes/jarRoutes');
const goalRoutes        = require('./routes/goalRoutes');1

app.use('/api/v1/auth',         authRoutes);
app.use('/api/v1/income',       incomeRoutes);
app.use('/api/v1/expense',      expenseRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/categories',   categoryRoutes);
app.use('/api/v1/dashboard',    dashboardRoutes);
app.use('/api/v1/chat',         chatRoutes);
app.use('/api/v1/users',        userRoutes);
app.use('/api/v1/recurring',    recurringRoutes);
app.use('/api/v1/analytics',    analyticsRoutes);
app.use('/api/v1/jars',  jarRoutes);
app.use('/api/v1/goals', goalRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8000;

// ✅ Connect DB first, then start HTTP and recurrence cron
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
    try {
      startRecurrenceCron();                         // start hourly tick AFTER DB is ready
      console.log('[recurrence] hourly tick armed');
    } catch (e) {
      console.warn('recurrence start skipped:', e?.message || e);
    }
  })
  .catch((err) => {
    console.error('Failed to connect DB:', err?.message || err);
    process.exit(1);
  });
