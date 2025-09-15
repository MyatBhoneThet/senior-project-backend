require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

connectDB();

const authRoutes        = require('./routes/authRoutes');
const incomeRoutes      = require('./routes/incomeRoutes');
const expenseRoutes     = require('./routes/expenseRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const categoryRoutes    = require('./routes/categoryRoutes');
const dashboardRoutes   = require('./routes/dashboardRoutes');
const chatRoutes        = require('./routes/chatRoutes');
const userRoutes        = require('./routes/userRoutes');
const recurringRoutes   = require('./routes/recurringRoutes');

const app = express();

// CORS for Vite + your deployed frontend
const allowedOrigins = ['http://localhost:5173', process.env.FRONTEND_URL].filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount routes
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
app.listen(PORT, () => console.log(`Server at http://localhost:${PORT}`));
