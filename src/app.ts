import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { testConnection } from "./config/database";

// Import routes
import authRoutes from "./routes/auth";
import chatRoutes from "./routes/chat";
import classificationsRoutes from "./routes/classifications";
import auditRoutes from "./routes/audit";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/classifications", classificationsRoutes);
app.use("/api/audit", auditRoutes);

// Root endpoint with API documentation
app.get("/", (_req, res) => {
  res.json({
    name: "Workforce Intelligence Platform - AI Agent API",
    version: "1.0.0",
    endpoints: {
      auth: {
        "POST /api/auth/login": "Authenticate and get JWT token",
        "GET /api/auth/me": "Get current user info",
        "GET /api/auth/users": "List sample users (for testing)",
      },
      chat: {
        "POST /api/chat": "Send a natural language query",
        "GET /api/chat/examples": "Get example queries",
      },
      classifications: {
        "POST /api/classifications/classify": "Classify a new application",
        "GET /api/classifications/pending": "Get pending classifications",
        "POST /api/classifications/:id/approve": "Approve a classification",
        "POST /api/classifications/:id/reject": "Reject a classification",
        "GET /api/classifications/rules": "Get classification rules",
        "GET /api/classifications/unclassified": "Get unclassified apps",
        "POST /api/classifications/batch": "Batch classify apps",
        "GET /api/classifications/stats": "Get classification statistics",
      },
      audit: {
        "GET /api/audit": "Get audit logs (admin only)",
        "GET /api/audit/summary": "Get audit summary (admin only)",
      },
    },
    authentication: "Use Bearer token in Authorization header",
    testCredentials: {
      email: "admin.user.1@company.com",
      password: "password123",
    },
  });
});

// Error handling middleware
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start server
async function start() {
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error(
      "Failed to connect to database. Please check your configuration."
    );
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log("\n🔐 Test credentials (run 'npm run seed' to see all users):");
    console.log("  Admin:    admin.user.1@company.com");
    console.log("  Manager:  manager.1@company.com");
    console.log("  Employee: employee.1@company.com");
    console.log("  Password: password123 (for all users)");
    console.log("\n💡 Use 'npm run seed' to populate database and see all user credentials");
  });
}

start();
