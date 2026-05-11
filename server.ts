import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import pg from "pg";
import https from "https";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

const { Pool } = pg;
const JWT_SECRET = process.env.JWT_SECRET || "llm-ops-monitor-secret-key-123";

// Agent to allow self-signed certificates common in internal LLM clusters
const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Database setup
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("supabase") || process.env.DATABASE_URL?.includes("render") 
      ? { rejectUnauthorized: false } 
      : false,
    max: 5, // 限制并发连接数，防止耗尽生产环境数据库资源
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, // 5秒连接超时
  });

  // Initialize DB table if it doesn't exist
  const initDb = async () => {
    try {
      const client = await pool.connect();
      
      // 1. Create Instances table
      await client.query(`
        CREATE TABLE IF NOT EXISTS instances (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'unknown',
          headers JSONB DEFAULT '{}'
        );
      `);

      // 2. Create User table (New API Compatible)
      await client.query(`
        CREATE TABLE IF NOT EXISTS "user" (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role INTEGER NOT NULL DEFAULT 1,
          email TEXT,
          status INTEGER NOT NULL DEFAULT 1,
          quota INTEGER DEFAULT 0
        );
      `);

      // 3. Ensure headers column exists for existing tables
      await client.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='instances' AND column_name='headers') THEN
            ALTER TABLE instances ADD COLUMN headers JSONB DEFAULT '{}';
          END IF;
        END $$;
      `);

      // 4. Create default admin if no users exist
      const userCount = await client.query('SELECT COUNT(*) FROM "user"');
      if (parseInt(userCount.rows[0].count) === 0) {
        const hashedPassword = await bcrypt.hash("123456", 10);
        await client.query(
          'INSERT INTO "user" (username, password, role, status) VALUES ($1, $2, $3, $4)',
          ["admin", hashedPassword, 100, 1]
        );
        console.log("Default admin user created (admin / 123456)");
      }

      client.release();
      console.log("Database initialized (Safety connection test OK)");
    } catch (err: any) {
      console.error("Database initialization failed. Ensure DATABASE_URL is set correctly.", err.message);
    }
  };
  
  if (process.env.DATABASE_URL) {
    initDb();
  }

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: "Forbidden" });
      req.user = user;
      next();
    });
  };

  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.user?.role !== 100) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  // Auth API
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing identity" });

    try {
      // 仅查询验证所需的关键字段，减少网络传输和负载
      const fields = 'id, username, password, role';
      let userRes = await pool.query(`SELECT ${fields} FROM "user" WHERE "username" = $1 LIMIT 1`, [username]);
      if (userRes.rows.length === 0) {
        // Fallback to 'users'
        userRes = await pool.query(`SELECT ${fields} FROM "users" WHERE "username" = $1 LIMIT 1`, [username]);
      }

      if (userRes.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

      const user = userRes.rows[0];
      const validPassword = await bcrypt.compare(password, user.password);
      
      if (!validPassword) {
        // As a extreme fallback for migrations/dev where plain text might exist (NOT RECOMMENDED)
        if (password !== user.password) {
           return res.status(401).json({ error: "Invalid credentials" });
        }
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({ 
        id: user.id, 
        username: user.username, 
        role: user.role 
      });
    } catch (err: any) {
      console.error("[Auth] Login error:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/auth/me", authenticateToken, (req: any, res: any) => {
    res.json(req.user);
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("auth_token");
    res.json({ success: true });
  });

  // Instances API - Protected
  app.get("/api/instances", authenticateToken, async (req, res) => {
    if (!process.env.DATABASE_URL) return res.json([]);
    try {
      const result = await pool.query("SELECT * FROM instances");
      console.log(`[DB] Fetched ${result.rows.length} instances`);
      res.json(result.rows);
    } catch (err: any) {
      console.error("[DB] Fetch error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/instances", authenticateToken, async (req, res) => {
    if (!process.env.DATABASE_URL) return res.status(400).json({ error: "DB not configured" });
    const { id, name, url, type, status, headers } = req.body;
    console.log(`[DB] Creating instance ${name} with headers:`, JSON.stringify(headers));
    try {
      await pool.query(
        "INSERT INTO instances (id, name, url, type, status, headers) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, name, url, type, status, headers || {}]
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error("[DB] Create error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/instances/:id", authenticateToken, async (req, res) => {
    if (!process.env.DATABASE_URL) return res.status(400).json({ error: "DB not configured" });
    const { id } = req.params;
    const { name, url, type, status, headers } = req.body;
    console.log(`[DB] Updating instance ${id} (${name}) with headers:`, JSON.stringify(headers));
    try {
      const result = await pool.query(
        "UPDATE instances SET name = $1, url = $2, type = $3, status = $4, headers = $5 WHERE id = $6",
        [name, url, type, status, headers || {}, id]
      );
      console.log(`[DB] Update result: ${result.rowCount} rows affected`);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[DB] Update error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/instances/:id", authenticateToken, async (req, res) => {
    if (!process.env.DATABASE_URL) return res.status(400).json({ error: "DB not configured" });
    const { id } = req.params;
    try {
      await pool.query("DELETE FROM instances WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/users", authenticateToken, requireAdmin, async (req, res) => {
    if (!process.env.DATABASE_URL) return res.json([]);
    try {
      // 生产环境安全查询：只选择公开字段，且设置严格数量限制 (New API 兼容)
      const safeFields = 'id, username, email, role, status, quota';
      let result;
      try {
        result = await pool.query(`SELECT ${safeFields} FROM "user" ORDER BY id DESC LIMIT 100`);
      } catch (err) {
        result = await pool.query(`SELECT ${safeFields} FROM "users" ORDER BY id DESC LIMIT 100`);
      }
      res.json(result.rows);
    } catch (err: any) {
      console.error("[DB] Users safe fetch error:", err.message);
      res.status(500).json({ error: "External database access failed" });
    }
  });

  // API Proxy to avoid CORS
  app.post("/api/proxy/metrics", async (req, res) => {
    const { url, headers } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }
    try {
      const parsedHeaders = headers || {};
      
      const axiosHeaders: any = {
        'User-Agent': 'LLM-Ops-Monitor/1.0',
        'Accept': '*/*',
        'Connection': 'close',
        ...parsedHeaders
      };

      console.log(`[Proxy] Metrics Request to ${url}`);
      console.log(`[Proxy] Final Header Keys:`, Object.keys(axiosHeaders));
      if (axiosHeaders.Cookie || axiosHeaders.cookie) {
        console.log(`[Proxy] Cookie header detected (length: ${String(axiosHeaders.Cookie || axiosHeaders.cookie).length})`);
      }

      const response = await axios.get(url as string, { 
        timeout: 15000,
        headers: axiosHeaders,
        httpsAgent: (url as string).startsWith('https') ? httpsAgent : undefined,
        maxRedirects: 5
      });
      res.send(response.data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || error.response?.data?.error || error.message;
      
      let errorDetail = `Failed to fetch metrics from ${url}`;
      if (message.includes('ECONNREFUSED') && ((url as string).includes('localhost') || (url as string).includes('127.0.0.1'))) {
        errorDetail = "Connection Refused: 'localhost' refers to the cloud server, not your local machine. Please use a public URL or IP accessible from the internet.";
      } else if (message.includes('socket hang up') || message.includes('ECONNRESET')) {
        errorDetail = "The target server closed the connection unexpectedly (Socket Hang Up). This may be due to high load, network instability, or firewall blocking the request.";
      }

      console.error(`Proxy metrics error (${status}) from ${url}:`, message);
      res.status(status).json({ 
        error: message, 
        detail: errorDetail
      });
    }
  });

  app.post("/api/proxy/health", async (req, res) => {
    const { url, headers } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }
    try {
      const parsedHeaders = headers || {};
      const axiosHeaders = {
        'User-Agent': 'LLM-Ops-Monitor/1.0',
        'Accept': 'application/json, text/plain, */*',
        ...parsedHeaders
      };

      const response = await axios.get(url as string, { 
        timeout: 5000,
        headers: axiosHeaders,
        httpsAgent: (url as string).startsWith('https') ? httpsAgent : undefined,
        maxRedirects: 5
      });
      res.json({ status: "healthy", data: response.data });
    } catch (error: any) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.error || error.message;
      res.json({ status: "unhealthy", error: message, code: status });
    }
  });

  // AI Proxy Endpoint (to bypass CORS)
  app.post("/api/proxy/ai", async (req, res) => {
    const { url, headers, body } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      const parsedHeaders = headers || {};
      const axiosHeaders: any = {
        'Content-Type': 'application/json',
        ...parsedHeaders
      };

      console.log(`[Proxy] AI Request to ${url}`);

      const response = await axios.post(url as string, body, { 
        headers: axiosHeaders,
        timeout: 30000 
      });

      res.json(response.data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || error.response?.data?.error || error.message;
      console.error(`Proxy AI error (${status}) from ${url}:`, message);
      res.status(status).json({ 
        error: message, 
        detail: `Failed to communicate with AI Gateway at ${url}`
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
