require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { startRecurrenceCron } = require('./services/recurrenceEngine');

const app = express();

// Connect DB
connectDB();
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});
// Basic middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS: allow localhost:5173 + env FRONTEND_URL
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

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

app.use('/api/v1/auth',         authRoutes);
app.use('/api/v1/income',       incomeRoutes);
app.use('/api/v1/expense',      expenseRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/categories',   categoryRoutes);
app.use('/api/v1/dashboard',    dashboardRoutes);
app.use('/api/v1/chat',         chatRoutes);
app.use('/api/v1/users',        userRoutes);
app.use('/api/v1/recurring',    recurringRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8000;

// Start cron safely (no timezone string to avoid invalid time zone error)
startRecurrenceCron();

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
