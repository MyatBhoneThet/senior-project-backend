require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const app = express();

// ✅ Connect DB
connectDB();

// ✅ Allowed origins (local + production from .env)
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL
].filter(Boolean);

// ✅ CORS middleware
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// ✅ Routes
const authRoutes = require("./routes/authRoutes");
const incomeRoutes = require("./routes/incomeRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
// const debugRoutes = require('./routes/debugRoutes');




app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/income", incomeRoutes);
app.use("/api/v1/expense", expenseRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/chat", chatRoutes);
// app.use('/api/v1/debug', debugRoutes);
// ✅ Healthcheck
app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));
app.use('/api/v1/recurring', require('./routes/recurringRoutes'));
app.use('/api/v1/transactions', require('./routes/transactionRoutes'));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const { startRecurrenceCron } = require('./services/recurrenceEngine');
startRecurrenceCron();

// ✅ Server listen
const PORT = process.env.PORT || 8000;
app.listen(PORT, () =>
  console.log(`🚀 Server is running on http://localhost:${PORT}`)
);

// require("dotenv").config();
// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// const connectDB = require("./config/db");

// const app = express();

// // ✅ Connect DB
// connectDB();

// // ✅ Allowed origins
// const allowedOrigins = [
//   "http://localhost:5173",
//   process.env.FRONTEND_URL, // your production frontend from .env
// ];

// // ✅ Regex for all Vercel subdomains
// const vercelRegex = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

// // ✅ CORS middleware
// app.use(
//   cors({
//     origin: function (origin, callback) {
//       if (!origin) return callback(null, true); // allow server-to-server, curl, Postman
//       if (allowedOrigins.includes(origin) || vercelRegex.test(origin)) {
//         return callback(null, true);
//       }
//       return callback(new Error("Not allowed by CORS: " + origin));
//     },
//     credentials: true,
//     methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );

// // ✅ Handle preflight
// app.options("*", cors());

// app.use(express.json());

// // ✅ Routes
// const authRoutes = require("./routes/authRoutes");
// const incomeRoutes = require("./routes/incomeRoutes");
// const expenseRoutes = require("./routes/expenseRoutes");
// const dashboardRoutes = require("./routes/dashboardRoutes");
// const userRoutes = require("./routes/userRoutes");
// const chatRoutes = require("./routes/chatRoutes");
// const debugRoutes = require("./routes/debugRoutes");

// app.use("/api/v1/auth", authRoutes);
// app.use("/api/v1/income", incomeRoutes);
// app.use("/api/v1/expense", expenseRoutes);
// app.use("/api/v1/dashboard", dashboardRoutes);
// app.use("/api/v1/users", userRoutes);
// app.use("/api/v1/chat", chatRoutes);
// app.use("/api/v1/debug", debugRoutes);
// app.use("/api/v1/recurring", require("./routes/recurringRoutes"));
// app.use("/api/v1/transactions", require("./routes/transactionRoutes"));

// // ✅ Healthcheck
// app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));

// // ✅ Static uploads
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// // ✅ Start recurrence cron
// const { startRecurrenceCron } = require("./services/recurrenceEngine");
// startRecurrenceCron();

// // ✅ Server listen
// const PORT = process.env.PORT || 8000;
// app.listen(PORT, () =>
//   console.log(`🚀 Server is running on http://localhost:${PORT}`)
// );
