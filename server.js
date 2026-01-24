require("dotenv").config();

// ========== DUAL-CLOUD TOGGLE ==========
const USE_GOOGLE_CLOUD = process.env.USE_GOOGLE_CLOUD === "true";
console.log(
  `\n🌐 Cloud Provider: ${USE_GOOGLE_CLOUD ? "Google Cloud" : "Azure"}\n`,
);

// Google Cloud SDKs (conditionally loaded)
let firebaseAdmin, firestoreDb, gcsBucket;

if (USE_GOOGLE_CLOUD) {
  try {
    firebaseAdmin = require("firebase-admin");
    const { Storage } = require("@google-cloud/storage");

    // Try to load service account from JSON file first, fallback to env vars
    let serviceAccountCredentials;
    const fs = require("fs");

    if (fs.existsSync("./service-account-key.json")) {
      // Use JSON file (local development)
      serviceAccountCredentials = require("./service-account-key.json");
    } else if (
      process.env.GOOGLE_PROJECT_ID &&
      process.env.GOOGLE_CLIENT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY
    ) {
      // Use environment variables (production deployment)
      serviceAccountCredentials = {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
      };
      console.log("📋 Using service account from environment variables");
    } else {
      throw new Error(
        "No service account credentials found (JSON file or env vars)",
      );
    }

    // Initialize Firebase Admin with service account
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccountCredentials),
    });
    firestoreDb = firebaseAdmin.firestore();
    console.log("✅ Firebase/Firestore initialized.");

    // Initialize GCS
    const gcsStorage = new Storage({
      projectId: serviceAccountCredentials.project_id,
      credentials: serviceAccountCredentials,
    });
    gcsBucket = gcsStorage.bucket(process.env.GCS_BUCKET_NAME);
    console.log(
      `✅ Google Cloud Storage initialized (Bucket: ${process.env.GCS_BUCKET_NAME})`,
    );

    console.log("ℹ️  AI Analysis: Using Azure Vision + Azure Gemini");
  } catch (gcpError) {
    console.error("❌ Google Cloud initialization failed:", gcpError.message);
    console.log(
      "   Make sure service-account-key.json exists OR GOOGLE_PROJECT_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY are set in .env",
    );
  }
}

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

// Azure AI SDKs for file processing
const createImageAnalysisClient =
  require("@azure-rest/ai-vision-image-analysis").default;
const { AzureKeyCredential } = require("@azure/core-auth");

// Document parsing libraries
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const XLSX = require("xlsx");

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
    // Use the official 'openai' package which provides AzureOpenAI class
    const { AzureOpenAI } = require("openai");
    openaiClient = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_KEY,
      apiVersion: "2024-02-15-preview",
      deployment: OPENAI_DEPLOYMENT,
    });
    console.log("Azure Gemini client initialized.");
  }
  return openaiClient;
}

// Azure Vision Client (Image tagging and captioning)
let visionClient = null;

function getVisionClient() {
  if (!visionClient && process.env.VISION_ENDPOINT && process.env.VISION_KEY) {
    visionClient = createImageAnalysisClient(
      process.env.VISION_ENDPOINT,
      new AzureKeyCredential(process.env.VISION_KEY),
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
async function classifyContent(description) {
  try {
    const client = getOpenAIClient();
    if (!client) return "General";

    const response = await client.chat.completions.create({
      model: OPENAI_DEPLOYMENT,
      messages: [
        {
          role: "system",
          content:
            "Classify this content into exactly ONE of these categories: 'Autonomous Driving', 'Medical Imaging', 'Robotics Training', 'Developer Tools', 'Financial Data', 'General'. Return only the category name.",
        },
        { role: "user", content: description },
      ],
    });

    return response.choices[0].message.content.trim();
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
  res.sendFile(path.join(__dirname, "terms.html")),
);
app.get("/privacy", (req, res) =>
  res.sendFile(path.join(__dirname, "privacy.html")),
);
app.get("/refund", (req, res) =>
  res.sendFile(path.join(__dirname, "refund.html")),
);

// ========== SESSION & PASSPORT CONFIGURATION ==========
app.use(
  session({
    secret:
      process.env.SESSION_SECRET || "mdata-oauth-secret-key-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
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
            `OAuth: Created new ${role} account for ${email} via Google`,
          );
          return done(null, { ...newUser, role });
        } catch (err) {
          console.error("Google OAuth error:", err);
          return done(err, null);
        }
      },
    ),
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
            `OAuth: Created new ${role} account for ${email} via GitHub`,
          );
          return done(null, { ...newUser, role });
        } catch (err) {
          console.error("GitHub OAuth error:", err);
          return done(err, null);
        }
      },
    ),
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
      storageConnectionString,
    );
    containerClient = blobServiceClient.getContainerClient("uploads");
    console.log("Connected to Azure Blob Storage.");
  } else {
    console.warn("AZURE_STORAGE_CONNECTION_STRING not found in .env");
  }
} catch (error) {
  console.error("Error connecting to Azure Blob Storage:", error.message);
}

// Helper: SHA256 Hash
function hashPassword(password, salt) {
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
    next,
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
  },
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
  },
);

// API: User Stats
app.get("/api/stats", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    let items = [];

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE QUERY ==========
      const snapshot = await firestoreDb
        .collection("Submissions")
        .where("userId", "==", userId)
        .orderBy("upload_timestamp", "desc")
        .get();
      items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } else {
      // ========== COSMOS DB QUERY ==========
      const submissionsContainer = database.container("Submissions");
      const querySpec = {
        query:
          "SELECT c.id, c.payout, c.quality_score, c.original_name, c.upload_timestamp, c.sold_to, c.transaction_date FROM c WHERE c.userId = @userId ORDER BY c.upload_timestamp DESC",
        parameters: [{ name: "@userId", value: userId }],
      };
      const { resources } = await submissionsContainer.items
        .query(querySpec)
        .fetchAll();
      items = resources;
    }

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
      dailyMap[`${yyyy}-${mm}-${dd}`] = 0;
    }

    items.forEach((item) => {
      const payout = item.payout || 0;
      const score = item.quality_score || 0;
      const isSold = !!item.sold_to;
      const userShare = isSold ? payout * 0.8 : 0;

      if (isSold) {
        totalEarnings += userShare;

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
        sold_price: item.sold_price || 0,
      });
    });

    const avgQuality =
      items.length > 0 ? (totalScore / items.length).toFixed(1) : 0;

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

  try {
    let items = [];

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE QUERY ==========
      const snapshot = await firestoreDb
        .collection("Submissions")
        .where("userId", "==", userId)
        .orderBy("upload_timestamp", "desc")
        .get();
      items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } else {
      // ========== COSMOS DB QUERY ==========
      const submissionsContainer = database.container("Submissions");
      const querySpec = {
        query:
          "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.upload_timestamp DESC",
        parameters: [{ name: "@userId", value: userId }],
      };
      const { resources } = await submissionsContainer.items
        .query(querySpec)
        .fetchAll();
      items = resources;
    }

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
    let item = null;

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE QUERY & DELETE ==========
      const docRef = firestoreDb.collection("Submissions").doc(fileId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({
          error: "File not found or you don't have permission to delete it",
        });
      }

      item = doc.data();

      if (item.userId !== userId) {
        return res.status(403).json({ error: "Permission denied" });
      }

      if (item.sold_to) {
        return res
          .status(400)
          .json({ error: "Cannot delete a file that has already been sold" });
      }

      // Delete from Firestore
      await docRef.delete();
      console.log(`Deleted from Firestore: ${fileId}`);

      // Delete from GCS
      if (gcsBucket) {
        try {
          const file = gcsBucket.file(fileId);
          await file.delete();
          console.log(`Deleted from GCS: ${fileId}`);
        } catch (gcsErr) {
          console.warn("Failed to delete from GCS:", gcsErr.message);
        }
      }
    } else {
      // ========== COSMOS DB QUERY & DELETE ==========
      const submissionsContainer = database.container("Submissions");

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

      item = items[0];

      if (item.sold_to) {
        return res
          .status(400)
          .json({ error: "Cannot delete a file that has already been sold" });
      }

      // Delete from Cosmos DB
      await submissionsContainer.item(fileId, userId).delete();

      // Delete from Azure Blob Storage
      if (blobServiceClient && item.blob_url) {
        try {
          const blobName = item.blob_url.split("/").pop().split("?")[0];
          const blobClient = containerClient.getBlobClient(blobName);
          await blobClient.deleteIfExists();
          console.log(`Deleted blob: ${blobName}`);
        } catch (blobErr) {
          console.warn("Failed to delete blob:", blobErr.message);
        }
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
    let items = [];

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE QUERY ==========
      const snapshot = await firestoreDb.collection("Submissions").get();
      items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } else {
      // ========== COSMOS DB QUERY ==========
      const container = database.container("Submissions");
      const querySpec = {
        query: "SELECT c.market_category, c.quality_score, c.sold_to FROM c",
      };
      const { resources } = await container.items.query(querySpec).fetchAll();
      items = resources;
    }

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

    let items = [];
    let totalSpent = 0;

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE QUERY ==========
      const submissionsSnap = await firestoreDb
        .collection("Submissions")
        .where("sold_to", "==", agencyId)
        .orderBy("transaction_date", "desc")
        .get();
      items = submissionsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Get total spent from Orders
      const ordersSnap = await firestoreDb
        .collection("Orders")
        .where("agencyId", "==", agencyId)
        .where("status", "==", "paid")
        .get();
      totalSpent = ordersSnap.docs.reduce(
        (sum, doc) => sum + (doc.data().totalAmount || 0),
        0,
      );
    } else {
      // ========== COSMOS DB QUERY ==========
      const container = database.container("Submissions");
      const querySpec = {
        query:
          "SELECT c.id, c.original_name, c.market_category, c.sold_price, c.transaction_date, c.quality_score FROM c WHERE c.sold_to = @agencyId ORDER BY c.transaction_date DESC",
        parameters: [{ name: "@agencyId", value: agencyId }],
      };
      const { resources } = await container.items.query(querySpec).fetchAll();
      items = resources;

      // Get total spent from Orders
      const ordersContainer = await getOrdersContainer();
      const { resources: orders } = await ordersContainer.items
        .query({
          query:
            "SELECT c.totalAmount FROM c WHERE c.agencyId = @agencyId AND c.status = 'paid'",
          parameters: [{ name: "@agencyId", value: agencyId }],
        })
        .fetchAll();
      totalSpent = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    }

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
      0,
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
          0,
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
  const accountType = role === "agency" ? "agency" : "user";

  try {
    let user = null;

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE QUERY ==========
      const collectionName = role === "agency" ? "Agencies" : "Users";
      const snapshot = await firestoreDb
        .collection(collectionName)
        .where("email", "==", email)
        .limit(1)
        .get();

      if (snapshot.empty) {
        const errorMessage =
          role === "agency"
            ? "Agency account not found."
            : "User account not found.";
        return res.status(404).json({
          success: false,
          error: errorMessage,
          errorType: "ACCOUNT_NOT_FOUND",
          accountType: accountType,
        });
      }

      const doc = snapshot.docs[0];
      user = { id: doc.id, ...doc.data() };
      console.log(
        `${role === "agency" ? "Agency" : "User"} ${user.name} logged in. ID: ${
          user.id
        }`,
      );
    } else {
      // ========== COSMOS DB QUERY ==========
      const targetContainer =
        role === "agency" ? agenciesContainer : usersContainer;

      if (!targetContainer) {
        return res
          .status(500)
          .json({ success: false, error: "Database not connected" });
      }

      const querySpec = {
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: email }],
      };

      const { resources: items } = await targetContainer.items
        .query(querySpec)
        .fetchAll();

      if (items.length > 0) {
        user = items[0];
      }
    }

    if (!user) {
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

    // Verify Password
    const inputHash = hashPassword(password, user.salt);
    if (inputHash !== user.password_hash) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid password. Please try again." });
    }

    console.log(
      `${accountType.charAt(0).toUpperCase() + accountType.slice(1)} ${
        user.name
      } logged in successfully.`,
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
  const accountType = role === "agency" ? "agency" : "contributor";
  const collectionName = role === "agency" ? "Agencies" : "Users";

  try {
    let existingUser = null;

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE CHECK ==========
      const snapshot = await firestoreDb
        .collection(collectionName)
        .where("email", "==", email)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        existingUser = snapshot.docs[0].data();
      }
    } else {
      // ========== COSMOS DB CHECK ==========
      const targetContainer =
        role === "agency" ? agenciesContainer : usersContainer;

      if (!targetContainer) {
        return res
          .status(500)
          .json({ success: false, error: "Database not connected" });
      }

      const querySpec = {
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: email }],
      };
      const { resources: existing } = await targetContainer.items
        .query(querySpec)
        .fetchAll();

      if (existing.length > 0) {
        existingUser = existing[0];
      }
    }

    if (existingUser) {
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

    // Create Account
    const salt = crypto.randomBytes(16).toString("hex");
    const password_hash = hashPassword(password, salt);
    const newAccount = {
      id: crypto.randomUUID(),
      name: name || (role === "agency" ? "New Agency" : "New User"),
      email: email,
      password_hash: password_hash,
      salt: salt,
      role: accountType,
      balance: 0.0,
      joined_date: new Date().toISOString(),
    };

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE CREATE ==========
      await firestoreDb
        .collection(collectionName)
        .doc(newAccount.id)
        .set(newAccount);
    } else {
      // ========== COSMOS DB CREATE ==========
      const targetContainer =
        role === "agency" ? agenciesContainer : usersContainer;
      await targetContainer.items.create(newAccount);
    }

    console.log(
      `${accountType.charAt(0).toUpperCase() + accountType.slice(1)} ${
        newAccount.name
      } created in ${collectionName} [${
        USE_GOOGLE_CLOUD ? "Firestore" : "Cosmos DB"
      }].`,
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

    let agency = null;

    if (USE_GOOGLE_CLOUD) {
      const doc = await firestoreDb.collection("Agencies").doc(agencyId).get();
      agency = doc.exists ? doc.data() : null;
    } else {
      const { resource } = await agenciesContainer
        .item(agencyId, agencyId)
        .read();
      agency = resource;
    }

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

    let agency = null;

    if (USE_GOOGLE_CLOUD) {
      const docRef = firestoreDb.collection("Agencies").doc(agencyId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: "Agency not found" });
      }
      agency = doc.data();

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

      await docRef.set(agency, { merge: true });
    } else {
      const { resource } = await agenciesContainer
        .item(agencyId, agencyId)
        .read();
      agency = resource;

      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
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
    }

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

    let agency = null;

    if (USE_GOOGLE_CLOUD) {
      const docRef = firestoreDb.collection("Agencies").doc(agencyId);
      const doc = await docRef.get();
      agency = doc.exists ? doc.data() : null;

      if (!agency || !agency.cart) {
        return res.json({ success: true, cart: [] });
      }

      agency.cart = agency.cart.filter(
        (c) => c.id !== itemId && c.category !== itemId,
      );
      await docRef.set(agency, { merge: true });
    } else {
      const { resource } = await agenciesContainer
        .item(agencyId, agencyId)
        .read();
      agency = resource;

      if (!agency || !agency.cart) {
        return res.json({ success: true, cart: [] });
      }

      agency.cart = agency.cart.filter(
        (c) => c.id !== itemId && c.category !== itemId,
      );
      await agenciesContainer.items.upsert(agency);
    }

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

    if (USE_GOOGLE_CLOUD) {
      const docRef = firestoreDb.collection("Agencies").doc(agencyId);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.set({ cart: [] }, { merge: true });
      }
    } else {
      const { resource: agency } = await agenciesContainer
        .item(agencyId, agencyId)
        .read();
      if (agency) {
        agency.cart = [];
        await agenciesContainer.items.upsert(agency);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Clear Cart Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// NOTE: Agency profile GET/PUT endpoints moved to end of file to support dual-cloud (Firestore + CosmosDB)
// See lines ~2934+ for the updated /api/agency/profile endpoints

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
    const {
      blobName,
      userId,
      originalName,
      fileSize,
      title,
      description,
      userTags,
    } = req.body;

    if (!blobName || !userId) {
      return res.status(400).json({ error: "Missing blobName or userId" });
    }

    console.log(
      `Processing file: ${blobName} for user: ${userId} [${
        USE_GOOGLE_CLOUD ? "GCP" : "Azure"
      }]`,
    );

    const filename = originalName || blobName;
    const fileExtension = path.extname(filename).toLowerCase();
    const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(
      fileExtension,
    );
    const isText = [
      ".txt",
      ".py",
      ".dart",
      ".js",
      ".md",
      ".json",
      ".html",
      ".css",
      ".ts",
      ".jsx",
      ".tsx",
    ].includes(fileExtension);
    const isPdf = fileExtension === ".pdf";
    const isDocx = fileExtension === ".docx";
    const isExcel = [".xlsx", ".xls"].includes(fileExtension);
    const isDocument = isPdf || isDocx || isExcel;

    // Initialize metadata with user-provided fields
    const metadata = {
      id: blobName,
      userId: userId,
      original_name: filename,
      title: title || filename,
      description: description || "",
      user_tags: userTags || [],
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

    if (USE_GOOGLE_CLOUD) {
      // ========== GOOGLE CLOUD STORAGE DOWNLOAD ==========
      try {
        if (gcsBucket) {
          const file = gcsBucket.file(blobName);
          const [contents] = await file.download();
          blobContent = contents;

          if (isText) {
            contentString = blobContent.toString("utf-8");
          } else if (isPdf) {
            // Extract text from PDF using pdf-parse v1.x
            try {
              const pdfData = await pdfParse(blobContent);
              contentString = pdfData.text || "";
              console.log(`Extracted ${contentString.length} chars from PDF`);
            } catch (pdfErr) {
              console.error("PDF parsing failed:", pdfErr.message);
            }
          } else if (isDocx) {
            // Extract text from DOCX
            try {
              const docxResult = await mammoth.extractRawText({
                buffer: blobContent,
              });
              contentString = docxResult.value;
              console.log(`Extracted ${contentString.length} chars from DOCX`);
            } catch (docxErr) {
              console.error("DOCX parsing failed:", docxErr.message);
            }
          } else if (isExcel) {
            // Extract text from Excel
            try {
              const workbook = XLSX.read(blobContent, { type: "buffer" });
              const sheetName = workbook.SheetNames[0];
              const sheet = workbook.Sheets[sheetName];
              contentString = XLSX.utils.sheet_to_csv(sheet);
              console.log(`Extracted ${contentString.length} chars from Excel`);
            } catch (xlsxErr) {
              console.error("Excel parsing failed:", xlsxErr.message);
            }
          }
          console.log(
            `Downloaded ${blobName} from GCS (${blobContent.length} bytes)`,
          );
        }
      } catch (downloadErr) {
        console.error("Failed to download from GCS:", downloadErr.message);
      }

      // ========== AZURE AI ANALYSIS (used with GCS storage) ==========
      if (isImage) {
        metadata.analysis_type = "image";

        if (blobContent) {
          const visionResult = await analyzeImageVision(blobContent);
          metadata.tags = visionResult.tags;
          metadata.caption = visionResult.caption;
          metadata.ai_analysis = visionResult.ai_analysis;

          const score = Math.min(visionResult.tags.length * 10, 100);
          metadata.quality_score = score;
          metadata.payout = calculatePayout(score);

          metadata.market_category = await classifyContent(
            `Image with tags: ${visionResult.tags.join(", ")}`,
          );
        } else {
          metadata.quality_score = 50;
          metadata.payout = 10;
        }
      } else if (isText || isDocument) {
        metadata.analysis_type = isDocument ? "document" : "code_or_text";

        if (contentString) {
          const aiResult = await analyzeContentQualityGPT4o(
            contentString,
            filename,
          );
          metadata.quality_score = aiResult.quality_score;
          metadata.payout = aiResult.payout;
          metadata.ai_analysis = aiResult.ai_analysis;

          metadata.market_category = await classifyContent(
            `Code/Text file named ${filename}. Summary: ${
              aiResult.ai_analysis?.summary || "N/A"
            }`,
          );
        } else {
          metadata.quality_score = 50;
          metadata.payout = 10;
          metadata.ai_analysis = {
            info: "Content could not be read for analysis.",
          };
        }
      } else {
        metadata.analysis_type = "other";
        metadata.ai_analysis = {
          info: "File type not supported for deep AI analysis yet.",
        };
        metadata.quality_score = 10;
        metadata.payout = 0.5;
      }

      // ========== STORE IN FIRESTORE ==========
      await firestoreDb
        .collection("Submissions")
        .doc(blobName)
        .set(metadata, { merge: true });
      console.log(
        `SUCCESS [GCP]: File ${filename} processed with Score: ${metadata.quality_score}`,
      );
    } else {
      // ========== AZURE BLOB STORAGE DOWNLOAD ==========
      try {
        if (containerClient) {
          const blobClient = containerClient.getBlobClient(blobName);
          const downloadResponse = await blobClient.download();
          const chunks = [];
          for await (const chunk of downloadResponse.readableStreamBody) {
            chunks.push(chunk);
          }
          blobContent = Buffer.concat(chunks);

          if (isText) {
            contentString = blobContent.toString("utf-8");
          } else if (isPdf) {
            try {
              const pdfData = await pdfParse(blobContent);
              contentString = pdfData.text || "";
            } catch (pdfErr) {
              console.error("PDF parsing failed:", pdfErr.message);
            }
          } else if (isDocx) {
            try {
              const docxResult = await mammoth.extractRawText({
                buffer: blobContent,
              });
              contentString = docxResult.value;
            } catch (docxErr) {
              console.error("DOCX parsing failed:", docxErr.message);
            }
          } else if (isExcel) {
            try {
              const workbook = XLSX.read(blobContent, { type: "buffer" });
              const sheetName = workbook.SheetNames[0];
              const sheet = workbook.Sheets[sheetName];
              contentString = XLSX.utils.sheet_to_csv(sheet);
            } catch (xlsxErr) {
              console.error("Excel parsing failed:", xlsxErr.message);
            }
          }
        }
      } catch (downloadErr) {
        console.error(
          "Failed to download blob for analysis:",
          downloadErr.message,
        );
      }

      // ========== AZURE AI ANALYSIS ==========
      if (isImage) {
        metadata.analysis_type = "image";

        if (blobContent) {
          const visionResult = await analyzeImageVision(blobContent);
          metadata.tags = visionResult.tags;
          metadata.caption = visionResult.caption;
          metadata.ai_analysis = visionResult.ai_analysis;

          const score = Math.min(visionResult.tags.length * 10, 100);
          metadata.quality_score = score;
          metadata.payout = calculatePayout(score);

          metadata.market_category = await classifyContent(
            `Image with tags: ${visionResult.tags.join(", ")}`,
          );
        } else {
          metadata.quality_score = 50;
          metadata.payout = 10;
        }
      } else if (isText || isDocument) {
        metadata.analysis_type = isDocument ? "document" : "code_or_text";

        if (contentString) {
          const aiResult = await analyzeContentQualityGPT4o(
            contentString,
            filename,
          );
          metadata.quality_score = aiResult.quality_score;
          metadata.payout = aiResult.payout;
          metadata.ai_analysis = aiResult.ai_analysis;

          metadata.market_category = await classifyContent(
            `Code/Text file named ${filename}. Summary: ${
              aiResult.ai_analysis?.summary || "N/A"
            }`,
          );
        } else {
          metadata.quality_score = 50;
          metadata.payout = 10;
          metadata.ai_analysis = {
            info: "Content could not be read for analysis.",
          };
        }
      } else {
        metadata.analysis_type = "other";
        metadata.ai_analysis = {
          info: "File type not supported for deep AI analysis yet.",
        };
        metadata.quality_score = 10;
        metadata.payout = 0.5;
      }

      // ========== STORE IN COSMOS DB ==========
      const submissionsContainer = database.container("Submissions");
      await submissionsContainer.items.upsert(metadata);
      console.log(
        `SUCCESS [Azure]: File ${filename} processed with Score: ${metadata.quality_score}`,
      );
    }

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
      "rzp_test_",
    )})`,
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

    // Store pending order
    const order = {
      id: orderId,
      agencyId,
      items: cartItems,
      totalAmount,
      razorpayOrderId: razorpayOrder.id,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE ==========
      await firestoreDb.collection("Orders").doc(orderId).set(order);
    } else {
      // ========== COSMOS DB ==========
      const ordersContainer = await getOrdersContainer();
      await ordersContainer.items.create(order);
    }

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
    let order = null;

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE: Find and update order ==========
      const ordersSnap = await firestoreDb
        .collection("Orders")
        .where("razorpayOrderId", "==", razorpay_order_id)
        .limit(1)
        .get();

      if (ordersSnap.empty) {
        console.warn("Order not found for Razorpay order:", razorpay_order_id);
        return res.status(404).json({ error: "Order not found" });
      }

      order = ordersSnap.docs[0].data();
      order.status = "paid";
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;
      order.paidAt = new Date().toISOString();

      await firestoreDb
        .collection("Orders")
        .doc(order.id)
        .set(order, { merge: true });

      // Get agency cart to find purchased categories
      console.log("Processing purchased items:", order.items);
      let purchasedCategories = [];

      const agencyDoc = await firestoreDb
        .collection("Agencies")
        .doc(order.agencyId)
        .get();
      if (agencyDoc.exists) {
        const agency = agencyDoc.data();
        if (agency.cart) {
          for (const itemId of order.items) {
            const cartItem = agency.cart.find((c) => c.id === itemId);
            if (cartItem && cartItem.category) {
              purchasedCategories.push(cartItem.category);
              console.log(
                "Found category for cart item:",
                itemId,
                "->",
                cartItem.category,
              );
            } else {
              purchasedCategories.push(itemId);
              console.log("Using itemId as category:", itemId);
            }
          }
        }
      }

      console.log("Purchased categories:", purchasedCategories);

      // Update submissions in purchased categories
      for (const category of purchasedCategories) {
        try {
          console.log("Looking for submissions in category:", category);
          const submissionsSnap = await firestoreDb
            .collection("Submissions")
            .where("market_category", "==", category)
            .get();

          for (const doc of submissionsSnap.docs) {
            const submission = doc.data();
            if (!submission.sold_to) {
              console.log(
                "Updating submission:",
                submission.id,
                "from user:",
                submission.userId,
              );
              await firestoreDb
                .collection("Submissions")
                .doc(submission.id)
                .update({
                  sold_to: order.agencyId,
                  sold_price: submission.payout || 25,
                  transaction_date: new Date().toISOString(),
                  status: "Purchased",
                });
              console.log("Submission updated successfully:", submission.id);

              // Credit user balance
              const userDoc = await firestoreDb
                .collection("Users")
                .doc(submission.userId)
                .get();
              if (userDoc.exists) {
                const currentBalance = userDoc.data().balance || 0;
                await firestoreDb
                  .collection("Users")
                  .doc(submission.userId)
                  .update({
                    balance: currentBalance + (submission.payout || 25),
                  });
                console.log(
                  "User",
                  submission.userId,
                  "credited:",
                  submission.payout || 25,
                );
              }
            }
          }
        } catch (queryErr) {
          console.error(
            "Error processing category:",
            category,
            queryErr.message,
          );
        }
      }

      // Clear agency cart
      await firestoreDb
        .collection("Agencies")
        .doc(order.agencyId)
        .update({ cart: [] });
    } else {
      // ========== COSMOS DB: Original implementation ==========
      const ordersContainer = await getOrdersContainer();

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

      order = orders[0];
      order.status = "paid";
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;
      order.paidAt = new Date().toISOString();

      await ordersContainer.items.upsert(order);

      const agenciesContainer = database.container("Agencies");
      const submissionsContainer = database.container("Submissions");

      console.log("Processing purchased items:", order.items);

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
          for (const itemId of order.items) {
            const cartItem = cart.find((c) => c.id === itemId);
            if (cartItem && cartItem.category) {
              purchasedCategories.push(cartItem.category);
            } else {
              purchasedCategories.push(itemId);
            }
          }
        }
      } catch (cartLookupErr) {
        console.error("Error fetching agency cart:", cartLookupErr.message);
        purchasedCategories = order.items;
      }

      console.log("Purchased categories:", purchasedCategories);

      for (const category of purchasedCategories) {
        try {
          const { resources: allSubmissions } = await submissionsContainer.items
            .query({
              query: "SELECT * FROM c WHERE c.market_category = @cat",
              parameters: [{ name: "@cat", value: category }],
            })
            .fetchAll();

          const submissions = allSubmissions.filter((s) => !s.sold_to);

          for (const submission of submissions) {
            try {
              submission.sold_to = order.agencyId;
              submission.sold_price = submission.payout || 25;
              submission.transaction_date = new Date().toISOString();
              submission.status = "Purchased";

              await submissionsContainer
                .item(submission.id, submission.userId)
                .replace(submission);
            } catch (updateErr) {
              console.error(
                "Error updating submission:",
                submission.id,
                updateErr.message,
              );
            }
          }
        } catch (queryErr) {
          console.error(
            "Error querying submissions for category:",
            category,
            queryErr.message,
          );
        }
      }

      // Clear agency cart
      try {
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
    }

    console.log(
      `Payment ${razorpay_payment_id} verified for order ${order.id}`,
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

// ========== FILE UPLOAD APIs ==========

// API: Get Upload SAS/Signed URL
app.get("/api/storage/sas", async (req, res) => {
  try {
    const { filename, contentType } = req.query;
    if (!filename) return res.status(400).json({ error: "Missing filename" });

    if (USE_GOOGLE_CLOUD) {
      // Google Cloud Storage Signed URL (v4)
      const mimeType = contentType || "application/octet-stream";

      const [url] = await gcsBucket.file(filename).getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType: mimeType,
      });

      res.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.set("Surrogate-Control", "no-store");

      res.json({
        sasUrl: url,
        provider: "gcp",
        requiredHeaders: {
          "Content-Type": mimeType,
        },
      });
    } else {
      // Azure Blob SAS
      const containerName = "uploads";
      const permissions = ContainerSASPermissions.parse("racwd");
      const validMinutes = 60;

      // Extract Account Name & Key
      const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const accountMap = new Map(
        connStr.split(";").map((s) => s.split("=", 2)),
      );
      const accountName = accountMap.get("AccountName");
      const accountKey = accountMap.get("AccountKey");

      if (!accountName || !accountKey) throw new Error("Invalid Azure Creds");

      const sharedKeyCredential = new StorageSharedKeyCredential(
        accountName,
        accountKey,
      );

      const sasOptions = {
        containerName,
        blobName: filename,
        permissions,
        startsOn: new Date(),
        expiresOn: new Date(new Date().valueOf() + validMinutes * 60 * 1000),
      };

      const sasToken = generateBlobSASQueryParameters(
        sasOptions,
        sharedKeyCredential,
      ).toString();

      const sasUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${filename}?${sasToken}`;

      res.json({
        sasUrl,
        provider: "azure",
        requiredHeaders: {
          "x-ms-blob-type": "BlockBlob",
        },
      });
    }
  } catch (err) {
    console.error("SAS Generation Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Get Download Signed URL (read-only)
app.get("/api/storage/download", async (req, res) => {
  try {
    const { filename } = req.query;
    if (!filename) return res.status(400).json({ error: "Missing filename" });

    if (USE_GOOGLE_CLOUD) {
      // Google Cloud Storage Signed URL for reading with download disposition
      const [url] = await gcsBucket.file(filename).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 30 * 60 * 1000, // 30 minutes
        responseDisposition: `attachment; filename="${filename}"`,
      });

      res.json({
        downloadUrl: url,
        provider: "gcp",
      });
    } else {
      // Azure Blob SAS for reading
      const { BlobSASPermissions } = require("@azure/storage-blob");
      const blobClient = containerClient.getBlobClient(filename);

      const blobPermissions = new BlobSASPermissions();
      blobPermissions.read = true;

      const expiryDate = new Date();
      expiryDate.setMinutes(expiryDate.getMinutes() + 30);

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: "uploads",
          blobName: filename,
          permissions: blobPermissions,
          expiresOn: expiryDate,
        },
        blobServiceClient.credential,
      ).toString();

      const downloadUrl = `${blobClient.url}?${sasToken}`;
      res.json({ downloadUrl, provider: "azure" });
    }
  } catch (err) {
    console.error("Download URL Generation Error:", err);
    res.status(500).json({ error: err.message });
  }
});
// API: Process Uploaded File
app.post("/api/process-file", async (req, res) => {
  try {
    const { blobName, userId, originalName, fileSize } = req.body;

    if (!blobName || !userId)
      return res.status(400).json({ error: "Missing blobName or userId" });

    const submissionId = crypto.randomUUID();
    const newSubmission = {
      id: submissionId,
      userId,
      original_name: originalName,
      blob_name: blobName,
      size: fileSize,
      upload_date: new Date().toISOString(),
      status: "completed",
      market_category: "General",
      quality_score: 85,
      payout: 0,
    };

    if (USE_GOOGLE_CLOUD) {
      await firestoreDb
        .collection("Submissions")
        .doc(submissionId)
        .set(newSubmission);
    } else {
      const container = database.container("Submissions");
      await container.items.create(newSubmission);
    }

    res.json({
      success: true,
      submissionId,
      message: "File processed and saved.",
    });
  } catch (err) {
    console.error("Process File Error:", err);
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
    let totalEarnings = 0;
    let withdrawnAmount = 0;

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE ==========
      // Calculate total earnings from sold submissions
      const submissionsSnap = await firestoreDb
        .collection("Submissions")
        .where("userId", "==", userId)
        .where("status", "==", "Purchased")
        .get();

      totalEarnings = submissionsSnap.docs.reduce((sum, doc) => {
        const item = doc.data();
        return sum + (item.payout || 0) * 0.8; // 80% to user
      }, 0);

      // Calculate withdrawn amount
      const withdrawalsSnap = await firestoreDb
        .collection("Withdrawals")
        .where("userId", "==", userId)
        .get();

      withdrawnAmount = withdrawalsSnap.docs
        .map((d) => d.data())
        .filter((w) =>
          ["pending", "processing", "completed"].includes(w.status),
        )
        .reduce((sum, w) => sum + w.amount, 0);
    } else {
      // ========== COSMOS DB ==========
      const submissionsContainer = database.container("Submissions");
      const { resources: items } = await submissionsContainer.items
        .query({
          query:
            "SELECT * FROM c WHERE c.userId = @userId AND c.sold_to != null",
          parameters: [{ name: "@userId", value: userId }],
        })
        .fetchAll();

      totalEarnings = items.reduce((sum, item) => {
        const payout = item.payout || 0;
        return sum + payout * 0.8; // 80% to user
      }, 0);

      const withdrawalsContainer = await getWithdrawalsContainer();
      const { resources: withdrawals } = await withdrawalsContainer.items
        .query({
          query:
            "SELECT * FROM c WHERE c.userId = @userId AND c.status IN ('pending', 'processing', 'completed')",
          parameters: [{ name: "@userId", value: userId }],
        })
        .fetchAll();

      withdrawnAmount = withdrawals.reduce((sum, w) => sum + w.amount, 0);
    }

    const availableBalance = totalEarnings - withdrawnAmount;

    if (amount > availableBalance) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ₹${availableBalance.toFixed(
          2,
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

    if (USE_GOOGLE_CLOUD) {
      await firestoreDb
        .collection("Withdrawals")
        .doc(withdrawalId)
        .set(withdrawal);
    } else {
      const withdrawalsContainer = await getWithdrawalsContainer();
      await withdrawalsContainer.items.create(withdrawal);
    }

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
    let withdrawals = [];
    let totalEarnings = 0;
    let withdrawnAmount = 0;

    if (USE_GOOGLE_CLOUD) {
      // ========== FIRESTORE ==========
      const withdrawalsSnap = await firestoreDb
        .collection("Withdrawals")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .get();
      withdrawals = withdrawalsSnap.docs.map((d) => d.data());

      const submissionsSnap = await firestoreDb
        .collection("Submissions")
        .where("userId", "==", userId)
        .where("status", "==", "Purchased")
        .get();

      totalEarnings = submissionsSnap.docs.reduce((sum, doc) => {
        return sum + (doc.data().payout || 0) * 0.8;
      }, 0);
    } else {
      // ========== COSMOS DB ==========
      const withdrawalsContainer = await getWithdrawalsContainer();
      const { resources: w } = await withdrawalsContainer.items
        .query({
          query:
            "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC",
          parameters: [{ name: "@userId", value: userId }],
        })
        .fetchAll();
      withdrawals = w;

      const submissionsContainer = database.container("Submissions");
      const { resources: items } = await submissionsContainer.items
        .query({
          query:
            "SELECT * FROM c WHERE c.userId = @userId AND c.sold_to != null",
          parameters: [{ name: "@userId", value: userId }],
        })
        .fetchAll();

      totalEarnings = items.reduce((sum, item) => {
        return sum + (item.payout || 0) * 0.8;
      }, 0);
    }

    withdrawnAmount = withdrawals
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
    let totalEarnings = 0;

    if (USE_GOOGLE_CLOUD) {
      const submissionsSnap = await firestoreDb
        .collection("Submissions")
        .where("userId", "==", userId)
        .where("status", "==", "Purchased")
        .get();

      totalEarnings = submissionsSnap.docs.reduce((sum, doc) => {
        return sum + (doc.data().payout || 0) * 0.8;
      }, 0);
    } else {
      const submissionsContainer = database.container("Submissions");
      const { resources: items } = await submissionsContainer.items
        .query({
          query:
            "SELECT * FROM c WHERE c.userId = @userId AND c.sold_to != null",
          parameters: [{ name: "@userId", value: userId }],
        })
        .fetchAll();

      totalEarnings = items.reduce((sum, item) => {
        return sum + (item.payout || 0) * 0.8;
      }, 0);
    }

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

    // Update password
    const hashedPassword = crypto
      .createHash("sha256")
      .update(newPassword)
      .digest("hex");

    if (USE_GOOGLE_CLOUD) {
      const agencyRef = firestoreDb.collection("Agencies").doc(agencyId);
      const doc = await agencyRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: "Agency not found" });
      }

      await agencyRef.update({
        password: hashedPassword,
        passwordChangedAt: new Date().toISOString(),
      });
    } else {
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
    }

    // Clear OTP from store
    passwordOtpStore.delete(agencyId);

    console.log(`Password changed for agency ${agencyId}`);
    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// API: Get Agency Profile
app.get("/api/agency/profile", async (req, res) => {
  const { agencyId } = req.query;
  if (!agencyId) return res.status(400).json({ error: "Missing agencyId" });

  console.log(
    `[GET Profile] Fetching for ${agencyId} (Cloud: ${USE_GOOGLE_CLOUD})`,
  );

  try {
    let agency = null;

    if (USE_GOOGLE_CLOUD) {
      // Try 1: Direct document lookup by key in Agencies
      let doc = await firestoreDb.collection("Agencies").doc(agencyId).get();
      console.log(`[GET Profile] Direct lookup in Agencies: ${doc.exists}`);

      // Try 2: If not found, query by 'id' field in Agencies
      if (!doc.exists) {
        console.log(`[GET Profile] Trying id field query in Agencies...`);
        const snapshot = await firestoreDb
          .collection("Agencies")
          .where("id", "==", agencyId)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          doc = snapshot.docs[0];
          console.log(
            `[GET Profile] Found in Agencies by id! Doc key: ${doc.id}`,
          );
        }
      }

      // Try 3: Search in Users collection as fallback
      if (!doc.exists) {
        console.log(`[GET Profile] Searching Users collection...`);
        let userDoc = await firestoreDb.collection("Users").doc(agencyId).get();

        if (!userDoc.exists) {
          const userSnapshot = await firestoreDb
            .collection("Users")
            .where("id", "==", agencyId)
            .limit(1)
            .get();

          if (!userSnapshot.empty) {
            userDoc = userSnapshot.docs[0];
          }
        }

        if (userDoc.exists) {
          doc = userDoc;
          console.log(`[GET Profile] Found in Users! Doc key: ${doc.id}`);
        }
      }

      agency = doc.exists ? { id: doc.id, ...doc.data() } : null;
    } else {
      const { resource } = await agenciesContainer
        .item(agencyId, agencyId)
        .read();
      agency = resource;
    }

    if (!agency) return res.status(404).json({ error: "Agency not found" });

    // Remove sensitive data
    const { password, password_hash, salt, ...safeAgency } = agency;
    res.json(safeAgency);
  } catch (err) {
    console.error("Get Profile Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Update Agency Profile
app.put("/api/agency/profile", async (req, res) => {
  const {
    agencyId,
    name,
    email,
    description,
    website,
    location,
    language,
    timezone,
    logo,
  } = req.body;
  if (!agencyId) return res.status(400).json({ error: "Missing agencyId" });

  console.log(
    `[PUT Profile] Updating agencyId: ${agencyId} (Cloud: ${USE_GOOGLE_CLOUD})`,
  );

  try {
    if (USE_GOOGLE_CLOUD) {
      const agencyRef = firestoreDb.collection("Agencies").doc(agencyId);
      let doc = await agencyRef.get();

      console.log(`[PUT Profile] Direct doc lookup: ${doc.exists}`);

      // Fallback: If doc not found by ID, try to find by querying Agencies
      if (!doc.exists) {
        console.log(`[PUT Profile] Trying Agencies id field query...`);
        const snapshot = await firestoreDb
          .collection("Agencies")
          .where("id", "==", agencyId)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          doc = snapshot.docs[0];
          console.log(
            `[PUT Profile] Found in Agencies by id! Doc key: ${doc.id}`,
          );
        }
      }

      // Fallback 2: Search Users collection
      if (!doc.exists) {
        console.log(`[PUT Profile] Searching Users collection...`);
        let userDoc = await firestoreDb.collection("Users").doc(agencyId).get();

        if (!userDoc.exists) {
          const userSnapshot = await firestoreDb
            .collection("Users")
            .where("id", "==", agencyId)
            .limit(1)
            .get();

          if (!userSnapshot.empty) {
            userDoc = userSnapshot.docs[0];
          }
        }

        if (userDoc.exists) {
          doc = userDoc;
          console.log(`[PUT Profile] Found in Users! Doc key: ${doc.id}`);
        }
      }

      if (!doc.exists)
        return res.status(404).json({ error: "Agency not found" });

      // Use the correct document reference (either original or from fallback)
      const updateRef = doc.ref || agencyRef;
      console.log(`[PUT Profile] Updating document: ${updateRef.id}`);

      // Build update object excluding undefined values (Firestore doesn't accept undefined)
      const updateData = { updatedAt: new Date().toISOString() };
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (description !== undefined) updateData.description = description;
      if (website !== undefined) updateData.website = website;
      if (location !== undefined) updateData.location = location;
      if (language !== undefined) updateData.language = language;
      if (timezone !== undefined) updateData.timezone = timezone;
      if (logo !== undefined) updateData.logo = logo;

      await updateRef.update(updateData);
    } else {
      const { resource: agency } = await agenciesContainer
        .item(agencyId, agencyId)
        .read();
      if (!agency) return res.status(404).json({ error: "Agency not found" });

      // Update fields
      agency.name = name || agency.name;
      agency.email = email || agency.email;
      agency.description = description || agency.description;
      agency.website = website || agency.website;
      agency.location = location || agency.location;
      agency.language = language || agency.language;
      agency.timezone = timezone || agency.timezone;
      agency.logo = logo || agency.logo;
      agency.updatedAt = new Date().toISOString();

      await agenciesContainer.item(agencyId, agencyId).replace(agency);
    }

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    console.error("Update Profile Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Get User Profile
app.get("/api/user/profile", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  console.log(
    `[GET User Profile] Fetching for ${userId} (Cloud: ${USE_GOOGLE_CLOUD})`,
  );

  try {
    let user = null;

    if (USE_GOOGLE_CLOUD) {
      // Try direct lookup
      let doc = await firestoreDb.collection("Users").doc(userId).get();
      console.log(`[GET User Profile] Direct lookup: ${doc.exists}`);

      // Fallback: query by id field
      if (!doc.exists) {
        const snapshot = await firestoreDb
          .collection("Users")
          .where("id", "==", userId)
          .limit(1)
          .get();
        if (!snapshot.empty) {
          doc = snapshot.docs[0];
          console.log(`[GET User Profile] Found by id field`);
        }
      }

      user = doc.exists ? { id: doc.id, ...doc.data() } : null;
    } else {
      const { resource } = await usersContainer.item(userId, userId).read();
      user = resource;
    }

    if (!user) return res.status(404).json({ error: "User not found" });

    // Remove sensitive data
    const { password, password_hash, salt, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    console.error("Get User Profile Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Update User Profile
app.put("/api/user/profile", async (req, res) => {
  const { userId, name, bio } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  console.log(
    `[PUT User Profile] Updating userId: ${userId} (Cloud: ${USE_GOOGLE_CLOUD})`,
  );

  try {
    if (USE_GOOGLE_CLOUD) {
      const userRef = firestoreDb.collection("Users").doc(userId);
      let doc = await userRef.get();

      console.log(`[PUT User Profile] Direct doc lookup: ${doc.exists}`);

      // Fallback: query by id field
      if (!doc.exists) {
        const snapshot = await firestoreDb
          .collection("Users")
          .where("id", "==", userId)
          .limit(1)
          .get();
        if (!snapshot.empty) {
          doc = snapshot.docs[0];
          console.log(`[PUT User Profile] Found by id field`);
        }
      }

      if (!doc.exists) return res.status(404).json({ error: "User not found" });

      const updateRef = doc.ref || userRef;

      // Build update object excluding undefined values
      const updateData = { updatedAt: new Date().toISOString() };
      if (name !== undefined) updateData.name = name;
      if (bio !== undefined) updateData.bio = bio;

      await updateRef.update(updateData);
      console.log(`[PUT User Profile] Updated successfully`);
    } else {
      const { resource: user } = await usersContainer
        .item(userId, userId)
        .read();
      if (!user) return res.status(404).json({ error: "User not found" });

      if (name !== undefined) user.name = name;
      if (bio !== undefined) user.bio = bio;
      user.updatedAt = new Date().toISOString();

      await usersContainer.items.upsert(user);
    }

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    console.error("Update User Profile Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
