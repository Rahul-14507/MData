require("dotenv").config();
const express = require("express");
const path = require("path");
const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;

// Security packages
const bcrypt = require("bcrypt");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");

// Document parsing
const pdf = require("pdf-parse");

// Azure AI SDKs for file processing
const { AzureOpenAI } = require("@azure/openai");
const createImageAnalysisClient =
  require("@azure-rest/ai-vision-image-analysis").default;
const { AzureKeyCredential } = require("@azure/core-auth");

const app = express();
const PORT = process.env.PORT || 3000;

// ========== AZURE AI CLIENT INITIALIZATION ==========

// Azure OpenAI Client (GPT-4o for content quality analysis)
let openaiClient = null;
const OPENAI_DEPLOYMENT = "gpt-4o";

function getOpenAIClient() {
  if (
    !openaiClient &&
    process.env.AZURE_OPENAI_ENDPOINT &&
    process.env.AZURE_OPENAI_KEY
  ) {
    openaiClient = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_KEY,
      apiVersion: "2024-02-15-preview",
    });
    console.log("Azure OpenAI client initialized.");
  }
  return openaiClient;
}

// Azure Vision Client (Image tagging and captioning)
let visionClient = null;

function getVisionClient() {
  if (!visionClient && process.env.VISION_ENDPOINT && process.env.VISION_KEY) {
    visionClient = createImageAnalysisClient(
      process.env.VISION_ENDPOINT,
      new AzureKeyCredential(process.env.VISION_KEY)
    );
    console.log("Azure Vision AI client initialized.");
  }
  return visionClient;
}

// ========== AI ANALYSIS FUNCTIONS ==========

// Content Safety Check (simplified - logs warning if not configured)
async function analyzeContentSafety(content, isImage = false) {
  // Content Safety SDK requires separate installation
  // For now, return safe by default with warning
  console.log("Content Safety check skipped (SDK not configured)");
  return { isSafe: true, reason: "Content Safety not configured" };
}

// GPT-4o Content Quality Analysis
async function analyzeContentQualityGPT4o(content, filename) {
  try {
    const client = getOpenAIClient();
    if (!client) {
      console.warn("OpenAI not configured - using default score");
      return {
        quality_score: 50,
        payout: 10,
        ai_analysis: { error: "OpenAI not configured" },
      };
    }

    const preview = content.substring(0, 8000);
    const prompt = `Analyze the following file named '${filename}'.
    
Determine:
1. Is this valid, high-quality code/text?
2. What does it do? (Short summary)
3. Assign a 'Trust Score' from 1 to 100 based on utility, cleanliness, and complexity.

Return ONLY a JSON object:
{
    "trust_score": <int>,
    "summary": "<string>",
    "reasoning": "<string>"
}

Content:
${preview}`;

    const response = await client.chat.completions.create({
      model: OPENAI_DEPLOYMENT,
      messages: [
        {
          role: "system",
          content: "You are a senior code auditor and data quality expert.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const resultJson = JSON.parse(response.choices[0].message.content);
    const score = resultJson.trust_score || 50;

    return {
      quality_score: score,
      payout: calculatePayout(score),
      ai_analysis: {
        summary: resultJson.summary,
        reasoning: resultJson.reasoning,
      },
    };
  } catch (e) {
    console.error("OpenAI analysis failed:", e.message);
    return { quality_score: 50, payout: 10, ai_analysis: { error: e.message } };
  }
}

// Azure Vision 4.0 Image Analysis
async function analyzeImageVision(imageBuffer) {
  try {
    const client = getVisionClient();
    if (!client) {
      console.warn("Vision AI not configured - using default analysis");
      return {
        tags: [],
        caption: "Vision AI not configured",
        ai_analysis: { error: "Not configured" },
      };
    }

    const response = await client.path("/imageanalysis:analyze").post({
      body: imageBuffer,
      queryParameters: {
        features: ["tags", "caption"],
      },
      contentType: "application/octet-stream",
    });

    if (response.status !== "200") {
      throw new Error(`Vision API error: ${response.status}`);
    }

    const result = response.body;
    const tags = result.tagsResult?.values?.map((t) => t.name) || [];
    const caption = result.captionResult?.text || "No caption generated";

    return {
      tags: tags,
      caption: caption,
      ai_analysis: {
        vision_model: "4.0",
        confidence: result.captionResult?.confidence || 0,
      },
    };
  } catch (e) {
    console.error("Vision analysis failed:", e.message);
    return {
      tags: [],
      caption: "Error in vision analysis",
      ai_analysis: { error: e.message },
    };
  }
}

// Classify content into market category using GPT-4o
async function classifyContent(description, filename = "") {
  try {
    const client = getOpenAIClient();
    if (!client) return "General";

    // Get file extension for better classification hints
    const ext = filename ? path.extname(filename).toLowerCase() : "";

    const response = await client.chat.completions.create({
      model: OPENAI_DEPLOYMENT,
      messages: [
        {
          role: "system",
          content: `You are a data marketplace classifier. Based on the file content and name, classify into exactly ONE of these categories:

TECHNICAL/CODE:
- 'Developer Tools' - Code, scripts, programming resources, APIs, SDKs
- 'Robotics Training' - Sensor data, motion capture, robotic systems
- 'Autonomous Driving' - Vehicle data, LIDAR, traffic, navigation

DATA/ANALYTICS:
- 'Financial Data' - Stock prices, transactions, banking, crypto, trading
- 'Business Analytics' - Sales data, marketing, CRM, business intelligence
- 'E-commerce' - Product catalogs, customer data, inventory, shopping

MEDIA/CREATIVE:
- 'Medical Imaging' - X-rays, MRI, CT scans, medical records
- 'Image Dataset' - Photos, graphics, visual training data
- 'Audio Dataset' - Sound files, voice recordings, music
- 'Video Dataset' - Video clips, footage, motion data

DOCUMENTS:
- 'Research Papers' - Academic papers, studies, scientific documents
- 'Legal Documents' - Contracts, agreements, legal text
- 'Educational Content' - Tutorials, courses, learning materials
- 'Documentation' - Manuals, guides, technical docs

OTHER:
- 'General' - Only if nothing else fits

Reply with JUST the category name, nothing else.`,
        },
        {
          role: "user",
          content: `File: "${filename}" (${ext})\nContent/Description: ${description.substring(
            0,
            2000
          )}`,
        },
      ],
      temperature: 0.1, // Low temperature for consistent classification
    });

    const category = response.choices[0].message.content.trim();

    // Validate category is one of the expected ones
    const validCategories = [
      "Developer Tools",
      "Robotics Training",
      "Autonomous Driving",
      "Financial Data",
      "Business Analytics",
      "E-commerce",
      "Medical Imaging",
      "Image Dataset",
      "Audio Dataset",
      "Video Dataset",
      "Research Papers",
      "Legal Documents",
      "Educational Content",
      "Documentation",
      "General",
    ];

    if (validCategories.includes(category)) {
      return category;
    }

    // If AI returned something unexpected, try to match it
    const lowerCategory = category.toLowerCase();
    for (const valid of validCategories) {
      if (
        lowerCategory.includes(valid.toLowerCase()) ||
        valid.toLowerCase().includes(lowerCategory)
      ) {
        return valid;
      }
    }

    console.log(
      `Classification returned unknown category: "${category}", defaulting to General`
    );
    return "General";
  } catch (e) {
    console.error("Classification failed:", e.message);
    return "General";
  }
}

// Calculate payout based on quality score
function calculatePayout(qualityScore) {
  if (qualityScore < 50) {
    return Math.max(0.1, qualityScore * 0.1);
  } else if (qualityScore < 80) {
    return 5 + (qualityScore - 50) * 0.5;
  } else {
    return 20 + (qualityScore - 80) * 4.0;
  }
}

// Middleware
app.use(express.json());

// Serve static files
app.use("/Agency", express.static(path.join(__dirname, "Agency")));
app.use("/User", express.static(path.join(__dirname, "User")));
app.use(express.static(__dirname));

// Clean URL routes for legal pages
app.get("/terms", (req, res) =>
  res.sendFile(path.join(__dirname, "terms.html"))
);
app.get("/privacy", (req, res) =>
  res.sendFile(path.join(__dirname, "privacy.html"))
);
app.get("/refund", (req, res) =>
  res.sendFile(path.join(__dirname, "refund.html"))
);

// ========== SECURITY MIDDLEWARE ==========

// Helmet for security headers (XSS, clickjacking protection, etc.)
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for now (can break inline scripts)
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? [process.env.ALLOWED_ORIGIN || "https://your-domain.com"]
        : true, // Allow all origins in development
    credentials: true,
  })
);

// Rate limiting - prevent brute force and DDoS
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit login attempts
  message: { error: "Too many login attempts, please try again later." },
});

app.use("/api/", apiLimiter);
app.use("/api/login", authLimiter);
app.use("/api/signup", authLimiter);

// ========== SESSION & PASSPORT CONFIGURATION ==========

// Require SESSION_SECRET in production
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error(
    "FATAL: SESSION_SECRET environment variable must be set in production!"
  );
  process.exit(1);
}

app.use(
  session({
    secret:
      process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Passport serialize/deserialize
passport.serializeUser((user, done) => {
  done(null, { id: user.id, role: user.role });
});

passport.deserializeUser(async (data, done) => {
  try {
    const container =
      data.role === "agency" ? agenciesContainer : usersContainer;
    if (!container) return done(null, false);

    const { resource } = await container.item(data.id, data.id).read();
    done(null, resource);
  } catch (err) {
    done(err, null);
  }
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:
          (process.env.BASE_URL || "http://localhost:3000") +
          "/auth/google/callback",
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails[0].value;
          const role = req.session.oauthRole || "user";
          const container =
            role === "agency" ? agenciesContainer : usersContainer;

          // Check if user exists
          const { resources } = await container.items
            .query({
              query: "SELECT * FROM c WHERE c.email = @email",
              parameters: [{ name: "@email", value: email }],
            })
            .fetchAll();

          if (resources.length > 0) {
            // User exists, log them in
            return done(null, { ...resources[0], role });
          }

          // Create new user
          const newUser = {
            id: crypto.randomUUID(),
            name: profile.displayName,
            email: email,
            oauth_provider: "google",
            oauth_id: profile.id,
            role: role === "agency" ? "agency" : "contributor",
            balance: 0.0,
            joined_date: new Date().toISOString(),
          };

          await container.items.create(newUser);
          console.log(
            `OAuth: Created new ${role} account for ${email} via Google`
          );
          return done(null, { ...newUser, role });
        } catch (err) {
          console.error("Google OAuth error:", err);
          return done(err, null);
        }
      }
    )
  );
  console.log("Google OAuth strategy configured.");
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL:
          (process.env.BASE_URL || "http://localhost:3000") +
          "/auth/github/callback",
        scope: ["user:email"],
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const email =
            profile.emails && profile.emails[0]
              ? profile.emails[0].value
              : `${profile.username}@github.local`;
          const role = req.session.oauthRole || "user";
          const container =
            role === "agency" ? agenciesContainer : usersContainer;

          // Check if user exists
          const { resources } = await container.items
            .query({
              query: "SELECT * FROM c WHERE c.email = @email",
              parameters: [{ name: "@email", value: email }],
            })
            .fetchAll();

          if (resources.length > 0) {
            return done(null, { ...resources[0], role });
          }

          // Create new user
          const newUser = {
            id: crypto.randomUUID(),
            name: profile.displayName || profile.username,
            email: email,
            oauth_provider: "github",
            oauth_id: profile.id,
            role: role === "agency" ? "agency" : "contributor",
            balance: 0.0,
            joined_date: new Date().toISOString(),
          };

          await container.items.create(newUser);
          console.log(
            `OAuth: Created new ${role} account for ${email} via GitHub`
          );
          return done(null, { ...newUser, role });
        } catch (err) {
          console.error("GitHub OAuth error:", err);
          return done(err, null);
        }
      }
    )
  );
  console.log("GitHub OAuth strategy configured.");
}

// Azure Cosmos DB Configuration
const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = "mdatadb";

let database;
let usersContainer; // For contributor accounts
let agenciesContainer; // For agency/buyer accounts

async function initCosmos() {
  try {
    const client = new CosmosClient({ endpoint, key });

    // Get or create database
    const { database: db } = await client.databases.createIfNotExists({
      id: databaseId,
    });
    database = db;

    // Get or create Users container (for contributors)
    const { container: usersC } = await database.containers.createIfNotExists({
      id: "Users",
      partitionKey: { paths: ["/id"] },
    });
    usersContainer = usersC;
    console.log(`Connected to Azure Cosmos DB: ${databaseId} > Users`);

    // Get or create Agencies container (for buyers)
    const { container: agenciesC } =
      await database.containers.createIfNotExists({
        id: "Agencies",
        partitionKey: { paths: ["/id"] },
      });
    agenciesContainer = agenciesC;
    console.log(`Connected to Azure Cosmos DB: ${databaseId} > Agencies`);
  } catch (err) {
    console.error("Failed to connect to Cosmos DB:", err.message);
  }
}

initCosmos();

// Azure Storage Configuration
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  ContainerSASPermissions,
} = require("@azure/storage-blob");

const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
let blobServiceClient;
let containerClient;

try {
  if (storageConnectionString) {
    blobServiceClient = BlobServiceClient.fromConnectionString(
      storageConnectionString
    );
    containerClient = blobServiceClient.getContainerClient("uploads");
    console.log("Connected to Azure Blob Storage.");
  } else {
    console.warn("AZURE_STORAGE_CONNECTION_STRING not found in .env");
  }
} catch (error) {
  console.error("Error connecting to Azure Blob Storage:", error.message);
}

// Helper: Bcrypt Password Hashing (secure, industry standard)
const BCRYPT_SALT_ROUNDS = 12;

async function hashPasswordBcrypt(password) {
  return await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Legacy SHA256 hash (for backward compatibility with existing users)
function hashPasswordLegacy(password, salt) {
  const hash = crypto.createHash("sha256");
  hash.update(password + salt);
  return hash.digest("hex");
}

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ========== OAUTH ROUTES ==========

// Google OAuth - User
app.get("/auth/google", (req, res, next) => {
  req.session.oauthRole = req.query.role || "user";
  passport.authenticate("google", { scope: ["profile", "email"] })(
    req,
    res,
    next
  );
});

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/?error=oauth_failed" }),
  (req, res) => {
    const role = req.user.role || "user";
    const redirectUrl =
      role === "agency" ? "/Agency/dashboard.html" : "/User/dashboard.html";

    // Set localStorage via client-side script
    const userData = JSON.stringify({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: role,
    });

    res.send(`
      <script>
        localStorage.setItem('user', '${userData.replace(/'/g, "\\'")}');
        window.location.href = '${redirectUrl}';
      </script>
    `);
  }
);

// GitHub OAuth
app.get("/auth/github", (req, res, next) => {
  req.session.oauthRole = req.query.role || "user";
  passport.authenticate("github", { scope: ["user:email"] })(req, res, next);
});

app.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/?error=oauth_failed" }),
  (req, res) => {
    const role = req.user.role || "user";
    const redirectUrl =
      role === "agency" ? "/Agency/dashboard.html" : "/User/dashboard.html";

    const userData = JSON.stringify({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: role,
    });

    res.send(`
      <script>
        localStorage.setItem('user', '${userData.replace(/'/g, "\\'")}');
        window.location.href = '${redirectUrl}';
      </script>
    `);
  }
);

// API: Generate SAS Token for blob download
app.get("/api/storage/sas", async (req, res) => {
  try {
    if (!blobServiceClient || !containerClient) {
      return res.status(500).json({ error: "Storage not configured" });
    }

    const blobName = req.query.blobName;

    if (!blobName) {
      // Container-level SAS for uploads (existing behavior)
      const permissions = new ContainerSASPermissions();
      permissions.write = true;
      permissions.create = true;
      permissions.list = true;
      permissions.read = true;

      const expiryDate = new Date();
      expiryDate.setMinutes(expiryDate.getMinutes() + 30);

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: "uploads",
          permissions: permissions,
          expiresOn: expiryDate,
        },
        blobServiceClient.credential
      ).toString();

      const sasUrl = `${containerClient.url}?${sasToken}`;
      return res.json({ sasUrl });
    }

    // Blob-specific SAS for downloads
    const { BlobSASPermissions } = require("@azure/storage-blob");
    const blobClient = containerClient.getBlobClient(blobName);

    const permissions = new BlobSASPermissions();
    permissions.read = true;

    const expiryDate = new Date();
    expiryDate.setMinutes(expiryDate.getMinutes() + 30);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: "uploads",
        blobName: blobName,
        permissions: permissions,
        expiresOn: expiryDate,
      },
      blobServiceClient.credential
    ).toString();

    const sasUrl = `${blobClient.url}?${sasToken}`;
    res.json({ sasUrl });
  } catch (error) {
    console.error("SAS Gen Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: User Stats
app.get("/api/stats", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const submissionsContainer = database.container("Submissions");
    // Ensure container exists logic is handled in Function App usually, but for reading we assume it exists or fail gracefully

    const querySpec = {
      query:
        "SELECT c.id, c.payout, c.quality_score, c.original_name, c.upload_timestamp, c.sold_to, c.transaction_date FROM c WHERE c.userId = @userId ORDER BY c.upload_timestamp DESC",
      parameters: [{ name: "@userId", value: userId }],
    };

    const { resources: items } = await submissionsContainer.items
      .query(querySpec)
      .fetchAll();

    let totalEarnings = 0.0;
    let totalScore = 0;
    const history = [];

    // Initialize map for last 30 days revenue
    const dailyMap = {};
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      dailyMap[`${yyyy}-${mm}-${dd}`] = 0; // Initialize with 0
    }

    items.forEach((item) => {
      const payout = item.payout || 0;
      const score = item.quality_score || 0;
      const isSold = !!item.sold_to;
      const userShare = isSold ? payout * 0.8 : 0;

      if (isSold) {
        totalEarnings += userShare;

        // Populate chart data
        if (item.transaction_date) {
          const tDate = item.transaction_date.split("T")[0];
          if (dailyMap.hasOwnProperty(tDate)) {
            dailyMap[tDate] += userShare;
          }
        }
      }
      totalScore += score;

      history.push({
        id: item.id,
        name: item.original_name || "Unknown",
        date: item.upload_timestamp
          ? item.upload_timestamp.split("T")[0]
          : "N/A",
        upload_date: item.upload_timestamp
          ? new Date(item.upload_timestamp).toLocaleDateString()
          : "N/A",
        quality_score: score,
        earnings: isSold ? `₹${userShare.toFixed(2)}` : "₹0.00",
        status: isSold ? "Sold" : item.status || "Pending",
        sold_to: item.sold_to || null,
      });
    });

    const avgQuality =
      items.length > 0 ? (totalScore / items.length).toFixed(1) : 0;

    // Convert dailyMap to sorted arrays for chart
    const sortedDates = Object.keys(dailyMap).sort();
    const chartData = sortedDates.map((date) => ({
      date,
      amount: parseFloat(dailyMap[date].toFixed(2)),
    }));

    res.json({
      earnings: `₹${totalEarnings.toFixed(2)}`,
      quality: `${avgQuality}%`,
      total_uploads: items.length,
      history: history,
      revenue_analytics: chartData,
    });
  } catch (error) {
    console.error("Stats Error:", error);
    // Fallback for demo if DB read fails (avoiding empty screen in dev)
    res.json({
      earnings: "₹0.00",
      quality: "0%",
      total_uploads: 0,
      history: [],
      revenue_analytics: [],
    });
  }
});

// API: File History
app.get("/api/files", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  // Re-use logic or call stats logic? Let's just quick query for now.
  // Actually, the Stats API returns history, so we can probably reuse that or just specific query.
  // Let's implement a specific one for the history page to potentially support pagination later.
  try {
    const submissionsContainer = database.container("Submissions");
    const querySpec = {
      query:
        "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.upload_timestamp DESC",
      parameters: [{ name: "@userId", value: userId }],
    };
    const { resources: items } = await submissionsContainer.items
      .query(querySpec)
      .fetchAll();
    res.json(items);
  } catch (err) {
    console.error("Files Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Delete File
app.delete("/api/files/:fileId", async (req, res) => {
  const fileId = req.params.fileId;
  const userId = req.query.userId;

  if (!fileId || !userId) {
    return res.status(400).json({ error: "Missing fileId or userId" });
  }

  try {
    const submissionsContainer = database.container("Submissions");

    // Query for the file by id and userId to get the item and verify ownership
    const querySpec = {
      query: "SELECT * FROM c WHERE c.id = @fileId AND c.userId = @userId",
      parameters: [
        { name: "@fileId", value: fileId },
        { name: "@userId", value: userId },
      ],
    };

    const { resources: items } = await submissionsContainer.items
      .query(querySpec)
      .fetchAll();

    if (!items || items.length === 0) {
      return res.status(404).json({
        error: "File not found or you don't have permission to delete it",
      });
    }

    const item = items[0];

    // Check if already sold
    if (item.sold_to) {
      return res
        .status(400)
        .json({ error: "Cannot delete a file that has already been sold" });
    }

    // Delete the item from Cosmos DB - use userId as partition key
    await submissionsContainer.item(fileId, userId).delete();

    // Optionally delete from Blob Storage as well
    if (blobServiceClient && item.blob_url) {
      try {
        const blobName = item.blob_url.split("/").pop().split("?")[0];
        const blobClient = containerClient.getBlobClient(blobName);
        await blobClient.deleteIfExists();
        console.log(`Deleted blob: ${blobName}`);
      } catch (blobErr) {
        console.warn(
          "Failed to delete blob, but database record was removed:",
          blobErr.message
        );
      }
    }

    res.json({ message: "File deleted successfully", fileId });
  } catch (err) {
    console.error("Delete File Error:", err);
    res.status(500).json({ error: err.message || "Failed to delete file" });
  }
});

// API: Market Summaries
app.get("/api/market/summaries", async (req, res) => {
  try {
    const container = database.container("Submissions");
    const querySpec = {
      query: "SELECT c.market_category, c.quality_score, c.sold_to FROM c",
    };

    const { resources: items } = await container.items
      .query(querySpec)
      .fetchAll();

    const marketStats = {};
    items.forEach((item) => {
      if (item.sold_to) return; // Skip sold items

      const cat = item.market_category || "General";
      const score = item.quality_score || 0;

      if (!marketStats[cat]) {
        marketStats[cat] = { count: 0, sum_score: 0 };
      }
      marketStats[cat].count++;
      marketStats[cat].sum_score += score;
    });

    const result = Object.keys(marketStats).map((cat) => ({
      market_category: cat,
      total_files: marketStats[cat].count,
      avg_quality: (
        marketStats[cat].sum_score / marketStats[cat].count
      ).toFixed(1),
    }));

    // Mock if empty (for demo)

    res.json(result);
  } catch (err) {
    console.error("Market Summaries Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Agency Purchases
app.get("/api/agency/purchases", async (req, res) => {
  try {
    const agencyId = req.query.agencyId;
    if (!agencyId) return res.status(400).json({ error: "Missing agencyId" });

    const container = database.container("Submissions");
    const querySpec = {
      query:
        "SELECT c.id, c.original_name, c.market_category, c.sold_price, c.transaction_date, c.quality_score FROM c WHERE c.sold_to = @agencyId ORDER BY c.transaction_date DESC",
      parameters: [{ name: "@agencyId", value: agencyId }],
    };

    const { resources: items } = await container.items
      .query(querySpec)
      .fetchAll();

    // Calculate Total Spend from Orders (more accurate than summing items)
    const ordersContainer = await getOrdersContainer();
    const { resources: orders } = await ordersContainer.items
      .query({
        query:
          "SELECT c.totalAmount FROM c WHERE c.agencyId = @agencyId AND c.status = 'paid'",
        parameters: [{ name: "@agencyId", value: agencyId }],
      })
      .fetchAll();

    const totalSpent = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    res.json({ items, totalSpent });
  } catch (err) {
    console.error("Agency Purchases Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Market Purchase
app.post("/api/market/purchase", async (req, res) => {
  try {
    const { category, agencyId } = req.body;
    if (!category || !agencyId)
      return res.status(400).json({ error: "Missing category or agencyId" });

    const container = database.container("Submissions");

    // 1. Fetch Items in Category
    const querySpec = {
      query: "SELECT * FROM c WHERE c.market_category = @category",
      parameters: [{ name: "@category", value: category }],
    };
    const { resources: items } = await container.items
      .query(querySpec)
      .fetchAll();

    // 2. Filter Unsold
    const unsoldItems = items.filter((i) => !i.sold_to);

    if (unsoldItems.length === 0) {
      return res
        .status(404)
        .json({ message: "No available datasets in this category." });
    }

    // 3. Buy top 5
    const itemsToBuy = unsoldItems.slice(0, 5);
    const purchasedCount = itemsToBuy.length;
    const totalBatchValue = purchasedCount * 25.0;
    const totalQualityScore = itemsToBuy.reduce(
      (sum, item) => sum + (item.quality_score || 0),
      0
    );

    // 4. Update Items
    for (const item of itemsToBuy) {
      item.sold_to = agencyId;
      item.transaction_date = new Date().toISOString();
      const itemQuality = item.quality_score || 0;

      let itemPayout = 0;
      if (totalQualityScore > 0) {
        itemPayout = totalBatchValue * (itemQuality / totalQualityScore);
      } else {
        itemPayout = totalBatchValue / purchasedCount;
      }

      item.payout = itemPayout;
      item.sold_price = itemPayout; // Agency view

      await container.items.upsert(item);
    }

    res.json({
      message: `Successfully purchased ${purchasedCount} items in '${category}'.`,
      count: purchasedCount,
      total_cost: totalBatchValue,
      note: "Payouts distributed to contributors based on AQI.",
    });
  } catch (err) {
    console.error("Purchase Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Market Bulk Checkout
app.post("/api/market/checkout", async (req, res) => {
  try {
    const { items, agencyId } = req.body; // items: [{ category: '...' }]
    if (!items || !Array.isArray(items) || !agencyId)
      return res.status(400).json({ error: "Invalid checkout data" });

    const container = database.container("Submissions");
    let totalPurchased = 0;
    let totalCost = 0;

    for (const cartItem of items) {
      const category = cartItem.category;

      // 1. Fetch Items
      const querySpec = {
        query: "SELECT * FROM c WHERE c.market_category = @category",
        parameters: [{ name: "@category", value: category }],
      };
      const { resources: allItems } = await container.items
        .query(querySpec)
        .fetchAll();
      const unsoldItems = allItems.filter((i) => !i.sold_to);

      if (unsoldItems.length > 0) {
        // Buy top 5
        const itemsToBuy = unsoldItems.slice(0, 5);
        const count = itemsToBuy.length;
        const batchValue = count * 25.0;
        totalCost += batchValue;
        totalPurchased += count;

        const totalQuality = itemsToBuy.reduce(
          (sum, i) => sum + (i.quality_score || 0),
          0
        );

        for (const item of itemsToBuy) {
          item.sold_to = agencyId;
          item.transaction_date = new Date().toISOString();
          const q = item.quality_score || 0;
          const payout =
            totalQuality > 0
              ? batchValue * (q / totalQuality)
              : batchValue / count;
          item.sold_price = payout;
          item.payout = payout;
          await container.items.upsert(item);
        }
      }
    }

    res.json({
      message: `Processed checkout. Bought ${totalPurchased} total datasets across ${items.length} bundles.`,
      total_cost: totalCost,
    });
  } catch (err) {
    console.error("Checkout Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Login
app.post("/api/login", async (req, res) => {
  const { email, password, role } = req.body;

  // Determine which container to use based on role
  const targetContainer =
    role === "agency" ? agenciesContainer : usersContainer;
  const accountType = role === "agency" ? "agency" : "user";

  if (!targetContainer) {
    return res
      .status(500)
      .json({ success: false, error: "Database not connected" });
  }

  try {
    // Query account by email in the appropriate container
    const querySpec = {
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: email }],
    };

    const { resources: items } = await targetContainer.items
      .query(querySpec)
      .fetchAll();

    if (items.length === 0) {
      // Account not found in the target container
      const errorMessage =
        role === "agency"
          ? "No agency account found with this email. Please create an agency account to access the marketplace."
          : "No user account found with this email. Please create an account to start earning from your data.";

      return res.status(404).json({
        success: false,
        error: errorMessage,
        errorType: "ACCOUNT_NOT_FOUND",
        accountType: accountType,
      });
    }

    const user = items[0];

    // Verify Password - support both bcrypt (new) and legacy SHA256 (existing users)
    let passwordValid = false;

    if (user.password_hash && user.password_hash.startsWith("$2")) {
      // User has bcrypt hash (new format)
      passwordValid = await verifyPassword(password, user.password_hash);
    } else if (user.salt) {
      // User has legacy SHA256 hash - verify and upgrade to bcrypt
      const legacyHash = hashPasswordLegacy(password, user.salt);
      if (legacyHash === user.password_hash) {
        passwordValid = true;
        // Upgrade to bcrypt for future logins
        const newHash = await hashPasswordBcrypt(password);
        try {
          await targetContainer.items.upsert({
            ...user,
            password_hash: newHash,
            salt: null,
          });
          console.log(`Upgraded password hash to bcrypt for ${user.email}`);
        } catch (upgradeErr) {
          console.error("Failed to upgrade password hash:", upgradeErr.message);
        }
      }
    }

    if (!passwordValid) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid password. Please try again." });
    }

    console.log(
      `${accountType.charAt(0).toUpperCase() + accountType.slice(1)} ${
        user.name
      } logged in successfully.`
    );

    const redirectUrl =
      role === "agency" ? "/Agency/dashboard.html" : "/User/dashboard.html";

    res.json({
      success: true,
      redirect: redirectUrl,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: role || user.role,
        balance: user.balance || 0,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// API: Signup
app.post("/api/signup", async (req, res) => {
  const { email, password, name, role } = req.body;

  // Determine which container to use based on role
  const targetContainer =
    role === "agency" ? agenciesContainer : usersContainer;
  const accountType = role === "agency" ? "agency" : "contributor";

  if (!targetContainer) {
    return res
      .status(500)
      .json({ success: false, error: "Database not connected" });
  }

  try {
    // Check if email already exists in target container
    const querySpec = {
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: email }],
    };
    const { resources: existing } = await targetContainer.items
      .query(querySpec)
      .fetchAll();

    if (existing.length > 0) {
      const errorMessage =
        role === "agency"
          ? "An agency account already exists with this email. Please sign in instead."
          : "A user account already exists with this email. Please sign in instead.";
      return res.status(409).json({
        success: false,
        error: errorMessage,
        errorType: "EMAIL_EXISTS",
      });
    }

    // Create Account with bcrypt password hash
    const password_hash = await hashPasswordBcrypt(password);
    const newAccount = {
      id: crypto.randomUUID(),
      name: name || (role === "agency" ? "New Agency" : "New User"),
      email: email,
      password_hash: password_hash,
      salt: null, // No salt needed for bcrypt (embedded in hash)
      role: accountType,
      balance: 0.0,
      joined_date: new Date().toISOString(),
    };

    await targetContainer.items.create(newAccount);
    console.log(
      `${accountType.charAt(0).toUpperCase() + accountType.slice(1)} ${
        newAccount.name
      } created in ${role === "agency" ? "Agencies" : "Users"} container.`
    );

    const redirectUrl =
      role === "agency" ? "/Agency/dashboard.html" : "/User/dashboard.html";

    res.status(201).json({
      success: true,
      redirect: redirectUrl,
      user: {
        id: newAccount.id,
        name: newAccount.name,
        email: newAccount.email,
        role: newAccount.role,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ========== AGENCY CART APIs (Cloud Storage) ==========

// GET agency cart
app.get("/api/agency/cart", async (req, res) => {
  try {
    const agencyId = req.query.agencyId;
    if (!agencyId) return res.status(400).json({ error: "Missing agencyId" });

    const { resource: agency } = await agenciesContainer
      .item(agencyId, agencyId)
      .read();

    if (!agency) {
      return res.json({ cart: [] });
    }

    res.json({ cart: agency.cart || [] });
  } catch (err) {
    if (err.code === 404) {
      return res.json({ cart: [] });
    }
    console.error("Get Cart Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ADD item to agency cart
app.post("/api/agency/cart", async (req, res) => {
  try {
    const { agencyId, item } = req.body;
    if (!agencyId || !item)
      return res.status(400).json({ error: "Missing agencyId or item" });

    // Get current agency
    let agency;
    try {
      const { resource } = await agenciesContainer
        .item(agencyId, agencyId)
        .read();
      agency = resource;
    } catch (e) {
      if (e.code === 404) {
        return res.status(404).json({ error: "Agency not found" });
      }
      throw e;
    }

    // Initialize cart if not exists
    if (!agency.cart) agency.cart = [];

    // Check for duplicates
    const existing = agency.cart.find((c) => c.category === item.category);
    if (existing) {
      return res
        .status(409)
        .json({ error: `${item.category} Bundle is already in your cart.` });
    }

    // Add item
    agency.cart.push({
      id: crypto.randomUUID(),
      ...item,
      addedAt: new Date().toISOString(),
    });

    await agenciesContainer.items.upsert(agency);
    res.json({ success: true, cart: agency.cart });
  } catch (err) {
    console.error("Add to Cart Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// REMOVE item from agency cart
app.delete("/api/agency/cart/:itemId", async (req, res) => {
  try {
    const agencyId = req.query.agencyId;
    const itemId = req.params.itemId;
    if (!agencyId) return res.status(400).json({ error: "Missing agencyId" });

    const { resource: agency } = await agenciesContainer
      .item(agencyId, agencyId)
      .read();

    if (!agency || !agency.cart) {
      return res.json({ success: true, cart: [] });
    }

    agency.cart = agency.cart.filter(
      (c) => c.id !== itemId && c.category !== itemId
    );
    await agenciesContainer.items.upsert(agency);

    res.json({ success: true, cart: agency.cart });
  } catch (err) {
    console.error("Remove from Cart Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// CLEAR agency cart
app.delete("/api/agency/cart", async (req, res) => {
  try {
    const agencyId = req.query.agencyId;
    if (!agencyId) return res.status(400).json({ error: "Missing agencyId" });

    const { resource: agency } = await agenciesContainer
      .item(agencyId, agencyId)
      .read();

    if (agency) {
      agency.cart = [];
      await agenciesContainer.items.upsert(agency);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Clear Cart Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== AGENCY PROFILE APIs ==========

// GET agency profile
app.get("/api/agency/profile", async (req, res) => {
  try {
    const agencyId = req.query.agencyId;
    if (!agencyId) return res.status(400).json({ error: "Missing agencyId" });

    const { resource: agency } = await agenciesContainer
      .item(agencyId, agencyId)
      .read();

    if (!agency) {
      return res.status(404).json({ error: "Agency not found" });
    }

    res.json({
      id: agency.id,
      name: agency.name,
      email: agency.email,
      phone: agency.phone || "",
      website: agency.website || "",
      description: agency.description || "",
      avatar: agency.avatar || null,
      joined_date: agency.joined_date,
    });
  } catch (err) {
    console.error("Get Profile Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE agency profile
app.put("/api/agency/profile", async (req, res) => {
  try {
    const { agencyId, name, phone, website, description, avatar } = req.body;
    if (!agencyId) return res.status(400).json({ error: "Missing agencyId" });

    const { resource: agency } = await agenciesContainer
      .item(agencyId, agencyId)
      .read();

    if (!agency) {
      return res.status(404).json({ error: "Agency not found" });
    }

    // Update fields
    if (name !== undefined) agency.name = name;
    if (phone !== undefined) agency.phone = phone;
    if (website !== undefined) agency.website = website;
    if (description !== undefined) agency.description = description;
    if (avatar !== undefined) agency.avatar = avatar;

    await agenciesContainer.items.upsert(agency);

    res.json({
      success: true,
      message: "Profile updated successfully",
      profile: {
        id: agency.id,
        name: agency.name,
        email: agency.email,
        phone: agency.phone,
        website: agency.website,
        description: agency.description,
        avatar: agency.avatar,
      },
    });
  } catch (err) {
    console.error("Update Profile Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===========================================
// In-House OTP System with Nodemailer
// ===========================================

// In-memory OTP storage (for production, use Redis or database)
const otpStore = new Map();

// Email transporter configuration
// Uses Gmail by default - requires SMTP_USER and SMTP_PASS in .env
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Gmail App Password (not regular password)
  },
});

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// OTP Email HTML Template
function getOTPEmailTemplate(otp) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="max-width: 500px;">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 16px 16px 0 0; padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">MData</h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Verify Your Email Address</p>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="background-color: #1e293b; padding: 40px 30px; text-align: center;">
                  <p style="color: #94a3b8; margin: 0 0 20px 0; font-size: 16px;">Your One-Time Password (OTP) is:</p>
                  <div style="background-color: #0f172a; border: 2px solid #3b82f6; border-radius: 12px; padding: 20px; margin: 20px 0;">
                    <span style="color: #3b82f6; font-size: 36px; font-weight: bold; letter-spacing: 8px;">${otp}</span>
                  </div>
                  <p style="color: #64748b; margin: 20px 0 0 0; font-size: 14px;">This code expires in <strong style="color: #f59e0b;">10 minutes</strong></p>
                  <p style="color: #475569; margin: 20px 0 0 0; font-size: 13px;">If you didn't request this code, please ignore this email.</p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background-color: #0f172a; border-radius: 0 0 16px 16px; padding: 20px; text-align: center; border-top: 1px solid #334155;">
                  <p style="color: #475569; margin: 0; font-size: 12px;">© 2024 MData. All rights reserved.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// Generate and send OTP
app.post("/api/otp/generate", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Check if SMTP is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error("SMTP credentials not configured");
      return res.status(500).json({
        error: "Email service not configured",
        message: "Please configure SMTP_USER and SMTP_PASS in .env",
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    otpStore.set(email.toLowerCase(), { otp, expiresAt });

    // Send email
    const mailOptions = {
      from: `"MData" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Verify Your Email - MData",
      html: getOTPEmailTemplate(otp),
    };

    await transporter.sendMail(mailOptions);

    console.log(`OTP sent to ${email}`);
    res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    console.error("OTP Generate Error:", err);
    res.status(500).json({
      error: "Failed to send OTP",
      message: err.message,
    });
  }
});

// Verify OTP
app.post("/api/otp/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    const stored = otpStore.get(email.toLowerCase());

    if (!stored) {
      return res.status(400).json({
        error: "OTP not found",
        message:
          "No OTP was generated for this email. Please request a new one.",
      });
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(email.toLowerCase());
      return res.status(400).json({
        error: "OTP expired",
        message: "This OTP has expired. Please request a new one.",
      });
    }

    if (stored.otp !== otp) {
      return res.status(400).json({
        error: "Invalid OTP",
        message: "The OTP you entered is incorrect. Please try again.",
      });
    }

    // OTP verified successfully - remove it
    otpStore.delete(email.toLowerCase());
    console.log(`OTP verified for ${email}`);

    res.json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("OTP Verify Error:", err);
    res.status(500).json({
      error: "Failed to verify OTP",
      message: err.message,
    });
  }
});

// ========== AI FILE PROCESSING API ==========
// This endpoint replaces the Azure Functions blob trigger
// Frontend calls this after successful blob upload

app.post("/api/process-file", async (req, res) => {
  try {
    const { blobName, userId, originalName, fileSize } = req.body;

    if (!blobName || !userId) {
      return res.status(400).json({ error: "Missing blobName or userId" });
    }

    console.log(`Processing file: ${blobName} for user: ${userId}`);

    const filename = originalName || blobName;
    const fileExtension = path.extname(filename).toLowerCase();

    // Initialize metadata
    const metadata = {
      id: blobName,
      userId: userId,
      original_name: filename,
      size: fileSize || 0,
      upload_timestamp: new Date().toISOString(),
      processed: true,
      analysis_type: "unknown",
      tags: [],
      caption: "",
      quality_score: 0,
      payout: 0,
      market_category: "Uncategorized",
      ai_analysis: {},
      is_safe: true,
      safety_reason: "Safe",
    };

    // Get the blob content for analysis
    let blobContent = null;
    let contentString = "";

    // Expanded list of supported text/code file extensions
    const textExtensions = [
      // Text & Markdown
      ".txt",
      ".md",
      ".markdown",
      ".rst",
      ".rtf",
      // Data files
      ".json",
      ".csv",
      ".xml",
      ".yaml",
      ".yml",
      ".toml",
      // Web development
      ".html",
      ".htm",
      ".css",
      ".scss",
      ".sass",
      ".less",
      // JavaScript ecosystem
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".mjs",
      ".cjs",
      ".vue",
      ".svelte",
      // Python
      ".py",
      ".pyw",
      ".pyx",
      ".pyi",
      // Java/Kotlin/Scala
      ".java",
      ".kt",
      ".kts",
      ".scala",
      ".groovy",
      // C/C++/C#
      ".c",
      ".h",
      ".cpp",
      ".hpp",
      ".cc",
      ".cs",
      // Go/Rust/Swift
      ".go",
      ".rs",
      ".swift",
      // Ruby/PHP/Perl
      ".rb",
      ".php",
      ".pl",
      ".pm",
      // Mobile
      ".dart",
      ".m",
      ".mm",
      // Shell/Scripts
      ".sh",
      ".bash",
      ".zsh",
      ".ps1",
      ".bat",
      ".cmd",
      // Database/Query
      ".sql",
      ".graphql",
      ".gql",
      // Config files
      ".ini",
      ".cfg",
      ".conf",
      ".env",
      ".properties",
      // Documentation
      ".tex",
      ".bib",
      ".org",
      // Other
      ".r",
      ".R",
      ".jl",
      ".lua",
      ".vim",
      ".awk",
      ".sed",
    ];

    try {
      if (containerClient) {
        const blobClient = containerClient.getBlobClient(blobName);
        const downloadResponse = await blobClient.download();
        const chunks = [];
        for await (const chunk of downloadResponse.readableStreamBody) {
          chunks.push(chunk);
        }
        blobContent = Buffer.concat(chunks);

        // For text-based files, decode to string
        if (textExtensions.includes(fileExtension)) {
          contentString = blobContent.toString("utf-8");
        }
      }
    } catch (downloadErr) {
      console.error(
        "Failed to download blob for analysis:",
        downloadErr.message
      );
      // Continue with default analysis if download fails
    }

    // Perform AI Analysis based on file type
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(fileExtension)) {
      metadata.analysis_type = "image";

      if (blobContent) {
        const visionResult = await analyzeImageVision(blobContent);
        metadata.tags = visionResult.tags;
        metadata.caption = visionResult.caption;
        metadata.ai_analysis = visionResult.ai_analysis;

        // Score based on richness of tags
        const score = Math.min(visionResult.tags.length * 10, 100);
        metadata.quality_score = score;
        metadata.payout = calculatePayout(score);

        // Classify based on tags - pass filename for better classification
        metadata.market_category = await classifyContent(
          `Image with tags: ${visionResult.tags.join(", ")}`,
          filename
        );
      } else {
        metadata.quality_score = 50;
        metadata.payout = 10;
      }
    } else if (textExtensions.includes(fileExtension)) {
      // Text/Code file analysis using the expanded textExtensions list
      metadata.analysis_type = "code_or_text";

      if (contentString) {
        const aiResult = await analyzeContentQualityGPT4o(
          contentString,
          filename
        );
        metadata.quality_score = aiResult.quality_score;
        metadata.payout = aiResult.payout;
        metadata.ai_analysis = aiResult.ai_analysis;

        // Classify based on content - pass filename for better classification
        metadata.market_category = await classifyContent(
          `File: ${filename}. Content summary: ${
            aiResult.ai_analysis?.summary || "N/A"
          }`,
          filename
        );
      } else {
        metadata.quality_score = 50;
        metadata.payout = 10;
        metadata.ai_analysis = {
          info: "Content could not be read for analysis.",
        };
      }
    } else if (
      [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"].includes(fileExtension)
    ) {
      // Audio files
      metadata.analysis_type = "audio";
      metadata.quality_score = 60;
      metadata.payout = calculatePayout(60);
      metadata.market_category = "Audio Dataset";
      metadata.ai_analysis = {
        info: "Audio file detected. Quality scoring based on file metadata.",
        file_size: metadata.size,
      };
    } else if (
      [".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv"].includes(fileExtension)
    ) {
      // Video files
      metadata.analysis_type = "video";
      metadata.quality_score = 65;
      metadata.payout = calculatePayout(65);
      metadata.market_category = "Video Dataset";
      metadata.ai_analysis = {
        info: "Video file detected. Quality scoring based on file metadata.",
        file_size: metadata.size,
      };
    } else if (
      [
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
        ".odt",
        ".ods",
      ].includes(fileExtension)
    ) {
      // Document files - handle PDFs with content extraction
      metadata.analysis_type = "document";

      if (fileExtension === ".pdf" && blobContent) {
        // Extract text from PDF using pdf-parse
        try {
          const pdfData = await pdf(blobContent);
          const extractedText = pdfData.text || "";
          const pageCount = pdfData.numpages || 0;

          if (extractedText.length > 100) {
            // Analyze the extracted PDF content with GPT-4o
            const aiResult = await analyzeContentQualityGPT4o(
              extractedText.substring(0, 15000), // Limit to 15k chars
              filename
            );

            metadata.quality_score = aiResult.quality_score;
            metadata.payout = aiResult.payout;
            metadata.ai_analysis = {
              ...aiResult.ai_analysis,
              page_count: pageCount,
              extracted_chars: extractedText.length,
              file_size: metadata.size,
            };

            // Classify based on extracted content
            metadata.market_category = await classifyContent(
              `PDF Document: ${filename}. Content summary: ${
                aiResult.ai_analysis?.summary || extractedText.substring(0, 500)
              }`,
              filename
            );
          } else {
            // PDF has very little text (might be scanned/image-based)
            metadata.quality_score = 45;
            metadata.payout = calculatePayout(45);
            metadata.ai_analysis = {
              info: "PDF appears to be image-based or has minimal text content.",
              page_count: pageCount,
              extracted_chars: extractedText.length,
              file_size: metadata.size,
            };
            metadata.market_category = "Documentation";
          }
        } catch (pdfErr) {
          console.error("PDF parsing failed:", pdfErr.message);
          metadata.quality_score = 50;
          metadata.payout = calculatePayout(50);
          metadata.ai_analysis = {
            info: "PDF parsing failed. File may be encrypted or corrupted.",
            error: pdfErr.message,
            file_size: metadata.size,
          };
          metadata.market_category = "Documentation";
        }
      } else {
        // Non-PDF documents (Word, Excel, PPT) - basic handling
        metadata.quality_score = 55;
        metadata.payout = calculatePayout(55);

        // Classify based on extension
        if ([".xls", ".xlsx", ".ods"].includes(fileExtension)) {
          metadata.market_category = "Business Analytics";
        } else if ([".ppt", ".pptx"].includes(fileExtension)) {
          metadata.market_category = "Educational Content";
        } else {
          metadata.market_category = "Documentation";
        }

        metadata.ai_analysis = {
          info: "Office document detected. Text extraction requires additional processing.",
          note: "For full content analysis, consider exporting as PDF.",
          file_size: metadata.size,
        };
      }
    } else {
      metadata.analysis_type = "other";
      metadata.ai_analysis = {
        info: "Unsupported file type for deep AI analysis.",
        supported_types:
          "Text files, code, images, audio, video, PDFs, Office docs",
      };
      metadata.quality_score = 30;
      metadata.payout = calculatePayout(30);
      metadata.market_category = "General";
    }

    // Store metadata in Cosmos DB Submissions container
    const submissionsContainer = database.container("Submissions");
    await submissionsContainer.items.upsert(metadata);

    console.log(
      `SUCCESS: File ${filename} processed with Score: ${metadata.quality_score}`
    );

    res.json({
      success: true,
      message: "File processed successfully",
      metadata: {
        id: metadata.id,
        quality_score: metadata.quality_score,
        payout: metadata.payout,
        market_category: metadata.market_category,
        analysis_type: metadata.analysis_type,
      },
    });
  } catch (err) {
    console.error("Process File Error:", err);
    res.status(500).json({ error: err.message || "Failed to process file" });
  }
});

// ========== RAZORPAY PAYMENT INTEGRATION ==========

// Initialize Razorpay with API credentials
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  console.log(
    `Razorpay initialized (Test Mode: ${process.env.RAZORPAY_KEY_ID.startsWith(
      "rzp_test_"
    )})`
  );
}

// Helper to get/create Orders container
async function getOrdersContainer() {
  const { container } = await database.containers.createIfNotExists({
    id: "Orders",
    partitionKey: { paths: ["/id"] },
  });
  return container;
}

// Helper to get/create Withdrawals container
async function getWithdrawalsContainer() {
  const { container } = await database.containers.createIfNotExists({
    id: "Withdrawals",
  });
  return container;
}

// API: Create Razorpay Order for Agency Checkout
app.post("/api/checkout/create-payment", async (req, res) => {
  const { agencyId, cartItems, totalAmount, email, phone, name } = req.body;

  if (!agencyId || !cartItems || !totalAmount) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!razorpay) {
    return res.status(500).json({
      error:
        "Payment gateway not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env",
    });
  }

  try {
    const orderId = `order_${Date.now()}_${crypto
      .randomBytes(4)
      .toString("hex")}`;

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // Razorpay uses paise
      currency: "INR",
      receipt: orderId,
      notes: {
        agencyId: agencyId,
        cartItems: cartItems.join(","),
        email: email || "",
        phone: phone || "",
      },
    });

    console.log("Razorpay Order Created:", razorpayOrder.id);

    // Store pending order in Cosmos DB
    const ordersContainer = await getOrdersContainer();
    const order = {
      id: orderId,
      agencyId,
      items: cartItems,
      totalAmount,
      razorpayOrderId: razorpayOrder.id,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await ordersContainer.items.create(order);

    // Return order details for frontend Razorpay checkout
    res.json({
      success: true,
      orderId,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      name: "MData",
      description: `Purchase ${cartItems.length} dataset(s)`,
      prefill: {
        name: name || "Customer",
        email: email || "",
        contact: phone || "",
      },
    });
  } catch (err) {
    console.error("Razorpay Order Error:", err);
    res.status(500).json({ error: err.message || "Failed to create payment" });
  }
});

// API: Verify Razorpay Payment (called after checkout is complete)
app.post("/api/checkout/verify-payment", async (req, res) => {
  console.log("Payment Verification Request:", req.body);

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    orderId,
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment verification data" });
  }

  // Verify signature
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    console.error("Payment signature verification failed");
    return res.status(400).json({ error: "Payment verification failed" });
  }

  console.log("Payment signature verified successfully");

  try {
    const ordersContainer = await getOrdersContainer();

    // Find order by razorpay_order_id
    const { resources: orders } = await ordersContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.razorpayOrderId = @rozId",
        parameters: [{ name: "@rozId", value: razorpay_order_id }],
      })
      .fetchAll();

    if (orders.length === 0) {
      console.warn("Order not found for Razorpay order:", razorpay_order_id);
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orders[0];

    // Update order with payment details
    order.status = "paid";
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.paidAt = new Date().toISOString();

    // Update order - use upsert for reliability
    await ordersContainer.items.upsert(order);

    // Mark datasets as purchased and credit seller wallets
    // First, get the actual cart items from agency to find categories
    const agenciesContainer = database.container("Agencies");
    const submissionsContainer = database.container("Submissions");

    console.log("Processing purchased items:", order.items);

    // Get the agency's cart to find the categories for each cart item
    let purchasedCategories = [];
    try {
      const { resources: agencies } = await agenciesContainer.items
        .query({
          query: "SELECT * FROM c WHERE c.id = @id",
          parameters: [{ name: "@id", value: order.agencyId }],
        })
        .fetchAll();

      if (agencies.length > 0 && agencies[0].cart) {
        const cart = agencies[0].cart;
        // Map cart item IDs to categories
        for (const itemId of order.items) {
          const cartItem = cart.find((c) => c.id === itemId);
          if (cartItem && cartItem.category) {
            purchasedCategories.push(cartItem.category);
            console.log(
              "Found category for cart item:",
              itemId,
              "->",
              cartItem.category
            );
          } else {
            // If the itemId IS the category (fallback for older cart format)
            purchasedCategories.push(itemId);
            console.log("Using itemId as category:", itemId);
          }
        }
      }
    } catch (cartLookupErr) {
      console.error("Error fetching agency cart:", cartLookupErr.message);
      // Fallback: assume cart items are category names
      purchasedCategories = order.items;
    }

    console.log("Purchased categories:", purchasedCategories);

    // Now update all submissions in these categories
    for (const category of purchasedCategories) {
      try {
        console.log("Looking for submissions in category:", category);
        const { resources: allSubmissions } = await submissionsContainer.items
          .query({
            query: "SELECT * FROM c WHERE c.market_category = @cat",
            parameters: [{ name: "@cat", value: category }],
          })
          .fetchAll();

        // Filter to only unsold items
        const submissions = allSubmissions.filter((s) => !s.sold_to);

        console.log("Found submissions in category:", submissions.length);

        for (const submission of submissions) {
          try {
            console.log(
              "Updating submission:",
              submission.id,
              "from user:",
              submission.userId
            );
            submission.sold_to = order.agencyId;
            submission.sold_price = submission.payout || 25;
            submission.transaction_date = new Date().toISOString();
            submission.status = "Purchased";

            await submissionsContainer
              .item(submission.id, submission.userId)
              .replace(submission);
            console.log("Submission updated successfully:", submission.id);
          } catch (updateErr) {
            console.error(
              "Error updating submission:",
              submission.id,
              updateErr.message
            );
          }
        }
      } catch (queryErr) {
        console.error(
          "Error querying submissions for category:",
          category,
          queryErr.message
        );
      }
    }

    // Clear agency cart
    try {
      const agenciesContainer = database.container("Agencies");
      const { resources: agencies } = await agenciesContainer.items
        .query({
          query: "SELECT * FROM c WHERE c.id = @id",
          parameters: [{ name: "@id", value: order.agencyId }],
        })
        .fetchAll();

      if (agencies.length > 0) {
        const agency = agencies[0];
        agency.cart = [];
        await agenciesContainer.item(agency.id, agency.id).replace(agency);
      }
    } catch (cartErr) {
      console.warn("Error clearing cart:", cartErr);
    }

    console.log(
      `Payment ${razorpay_payment_id} verified for order ${order.id}`
    );

    res.json({
      success: true,
      message: "Payment verified successfully",
      orderId: order.id,
    });
  } catch (err) {
    console.error("Payment verification error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Check Payment Status
app.get("/api/checkout/status/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const { agencyId } = req.query;

  if (!orderId || !agencyId) {
    return res.status(400).json({ error: "Missing orderId or agencyId" });
  }

  try {
    const ordersContainer = await getOrdersContainer();
    const { resource: order } = await ordersContainer
      .item(orderId, agencyId)
      .read();

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({
      orderId: order.id,
      status: order.status,
      paidAt: order.paidAt,
      items: order.items,
    });
  } catch (err) {
    console.error("Order status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== USER WITHDRAWAL SYSTEM ==========

// API: Request Withdrawal (Manual processing until Marketplace API)
app.post("/api/user/withdraw-request", async (req, res) => {
  const { userId, amount, upiId, bankAccount, ifsc, accountName } = req.body;

  if (!userId || !amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Minimum withdrawal
  const MIN_WITHDRAWAL = 100;
  if (amount < MIN_WITHDRAWAL) {
    return res
      .status(400)
      .json({ error: `Minimum withdrawal is ₹${MIN_WITHDRAWAL}` });
  }

  // Must have either UPI or bank details
  if (!upiId && (!bankAccount || !ifsc)) {
    return res
      .status(400)
      .json({ error: "Please provide UPI ID or bank account details" });
  }

  try {
    // Get user balance from submissions
    const submissionsContainer = database.container("Submissions");
    const { resources: items } = await submissionsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId AND c.sold_to != null",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    const totalEarnings = items.reduce((sum, item) => {
      const payout = item.payout || 0;
      return sum + payout * 0.8; // 80% to user
    }, 0);

    // Get already withdrawn/pending amounts
    const withdrawalsContainer = await getWithdrawalsContainer();
    const { resources: withdrawals } = await withdrawalsContainer.items
      .query({
        query:
          "SELECT * FROM c WHERE c.userId = @userId AND c.status IN ('pending', 'processing', 'completed')",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    const withdrawnAmount = withdrawals.reduce((sum, w) => sum + w.amount, 0);
    const availableBalance = totalEarnings - withdrawnAmount;

    if (amount > availableBalance) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ₹${availableBalance.toFixed(
          2
        )}`,
      });
    }

    // Create withdrawal request
    const withdrawalId = `withdraw_${Date.now()}_${crypto
      .randomBytes(4)
      .toString("hex")}`;
    const withdrawal = {
      id: withdrawalId,
      userId,
      amount,
      upiId: upiId || null,
      bankAccount: bankAccount || null,
      ifsc: ifsc || null,
      accountName: accountName || null,
      status: "pending",
      createdAt: new Date().toISOString(),
      processedAt: null,
    };

    await withdrawalsContainer.items.create(withdrawal);

    res.json({
      success: true,
      message:
        "Withdrawal request submitted. Processing within 3-5 business days.",
      withdrawalId,
      balance: availableBalance - amount,
    });
  } catch (err) {
    console.error("Withdrawal request error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Get User Withdrawals
app.get("/api/user/withdrawals", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const withdrawalsContainer = await getWithdrawalsContainer();
    const { resources: withdrawals } = await withdrawalsContainer.items
      .query({
        query:
          "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    // Calculate available balance
    const submissionsContainer = database.container("Submissions");
    const { resources: items } = await submissionsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId AND c.sold_to != null",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    const totalEarnings = items.reduce((sum, item) => {
      return sum + (item.payout || 0) * 0.8;
    }, 0);

    const withdrawnAmount = withdrawals
      .filter((w) => w.status !== "rejected")
      .reduce((sum, w) => sum + w.amount, 0);

    res.json({
      withdrawals,
      totalEarnings: totalEarnings.toFixed(2),
      withdrawnAmount: withdrawnAmount.toFixed(2),
      availableBalance: (totalEarnings - withdrawnAmount).toFixed(2),
    });
  } catch (err) {
    console.error("Get withdrawals error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Get User Balance
app.get("/api/user/balance", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const submissionsContainer = database.container("Submissions");
    const { resources: items } = await submissionsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId AND c.sold_to != null",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    const totalEarnings = items.reduce((sum, item) => {
      return sum + (item.payout || 0) * 0.8;
    }, 0);

    const withdrawalsContainer = await getWithdrawalsContainer();
    const { resources: withdrawals } = await withdrawalsContainer.items
      .query({
        query:
          "SELECT * FROM c WHERE c.userId = @userId AND c.status IN ('pending', 'processing', 'completed')",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    const withdrawnAmount = withdrawals.reduce((sum, w) => sum + w.amount, 0);
    const pendingWithdrawals = withdrawals
      .filter((w) => w.status === "pending" || w.status === "processing")
      .reduce((sum, w) => sum + w.amount, 0);

    res.json({
      totalEarnings: totalEarnings.toFixed(2),
      availableBalance: (totalEarnings - withdrawnAmount).toFixed(2),
      pendingWithdrawals: pendingWithdrawals.toFixed(2),
      completedWithdrawals: (withdrawnAmount - pendingWithdrawals).toFixed(2),
    });
  } catch (err) {
    console.error("Balance error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== PASSWORD CHANGE WITH OTP ==========

// Email transporter for password OTP
const passwordEmailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// In-memory OTP store for password changes (key: agencyId, value: { otp, email, expires })
const passwordOtpStore = new Map();

// API: Send Password Change OTP
app.post("/api/agency/send-password-otp", async (req, res) => {
  const { agencyId, email } = req.body;

  if (!agencyId || !email) {
    return res.status(400).json({ error: "Missing agencyId or email" });
  }

  try {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store with 5-minute expiry
    passwordOtpStore.set(agencyId, {
      otp,
      email,
      expires: Date.now() + 5 * 60 * 1000,
    });

    // Send email
    await passwordEmailTransporter.sendMail({
      from: `"MData Security" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "MData - Password Change Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3b82f6;">Password Change Request</h2>
          <p>You've requested to change your password. Use the following verification code:</p>
          <div style="background: #f1f5f9; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${otp}</span>
          </div>
          <p style="color: #64748b;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
          <p style="color: #64748b; margin-top: 20px;">— The MData Team</p>
        </div>
      `,
    });

    console.log(`Password OTP sent to ${email} for agency ${agencyId}`);
    res.json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("Password OTP error:", error);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// API: Change Password (with OTP verification)
app.post("/api/agency/change-password", async (req, res) => {
  const { agencyId, otp, newPassword } = req.body;

  if (!agencyId || !otp || !newPassword) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Verify OTP
    const storedData = passwordOtpStore.get(agencyId);
    if (!storedData) {
      return res
        .status(400)
        .json({ error: "No OTP request found. Please request a new OTP." });
    }

    if (Date.now() > storedData.expires) {
      passwordOtpStore.delete(agencyId);
      return res
        .status(400)
        .json({ error: "OTP has expired. Please request a new one." });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Hash the new password
    const hashedPassword = crypto
      .createHash("sha256")
      .update(newPassword)
      .digest("hex");

    // Update password in Agencies container
    const { resource: agency } = await agenciesContainer
      .item(agencyId, agencyId)
      .read();

    if (!agency) {
      return res.status(404).json({ error: "Agency not found" });
    }

    agency.password = hashedPassword;
    agency.passwordChangedAt = new Date().toISOString();

    await agenciesContainer.item(agencyId, agencyId).replace(agency);

    // Clear OTP from store
    passwordOtpStore.delete(agencyId);

    console.log(`Password changed for agency ${agencyId}`);
    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
