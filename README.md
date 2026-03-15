# MData - Ethical AI Data Marketplace

> **Fueling AI with Ethical Data**

A marketplace where data contributors earn rewards for quality datasets, and AI agencies access verified training data.

**Live:** https://mdata.co.in

---

## 🚀 Features

- **For Contributors:** Upload datasets → AI analysis → Earn payouts based on quality
- **For Agencies:** Browse marketplace → Cart system → Purchase verified datasets
- **AI-Powered:** GPT-4o quality scoring, Vision AI image tagging, Document Intelligence OCR
- **Secure:** Email OTP auth, encrypted storage, SSL

---

## 🛠 Tech Stack

| Layer    | Technology                         |
| -------- | ---------------------------------- |
| Frontend | HTML, CSS, TailwindCSS, Vanilla JS |
| Backend  | Node.js 20, Express.js             |
| Database | Azure Cosmos DB (NoSQL)            |
| Storage  | Azure Blob Storage                 |
| AI       | Azure OpenAI (GPT-4o), Vision AI, Document Intelligence |
| Hosting  | Azure App Service (B1 Linux)       |
| CI/CD    | GitHub Actions                     |

---

## 📁 Project Structure

```
MData/
├── server.js          # Express server (all backend logic)
├── package.json       # Dependencies
├── index.html         # Landing page
├── User/              # Contributor portal
│   ├── login.html
│   ├── dashboard.html
│   └── upload_files.html
├── Agency/            # Agency portal
│   ├── login.html
│   ├── dashboard.html
│   └── marketplace.html
└── .github/workflows/ # CI/CD
```

---

## 🏃 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Create .env file with:
# COSMOS_ENDPOINT=https://...
# COSMOS_KEY=...
# AZURE_STORAGE_CONNECTION_STRING=...
# SMTP_USER=...
# SMTP_PASS=...

# Run
node server.js
```

Open http://localhost:8080

### Deploy to Azure

```bash
git add .
git commit -m "Your changes"
git push origin main
```

GitHub Actions auto-deploys to Azure App Service.

---

## 🔧 Environment Variables

| Variable                          | Purpose            |
| --------------------------------- | ------------------ |
| `COSMOS_ENDPOINT`                 | Cosmos DB URL      |
| `COSMOS_KEY`                      | Cosmos DB key      |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob storage       |
| `AZURE_OPENAI_ENDPOINT`           | GPT-4o service     |
| `AZURE_OPENAI_KEY`                | GPT-4o key         |
| `VISION_ENDPOINT`                 | Image analysis     |
| `VISION_KEY`                      | Vision AI key      |
| `SMTP_USER`                       | Email (for OTP)    |
| `SMTP_PASS`                       | Email app password |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Document Intelligence URL |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY`      | Document Intelligence key |

---

## 📊 API Endpoints

| Method | Endpoint            | Description    |
| ------ | ------------------- | -------------- |
| POST   | `/api/user/signup`  | Create user    |
| POST   | `/api/user/login`   | User login     |
| POST   | `/api/upload-sas`   | Get upload URL |
| POST   | `/api/process-file` | AI analysis    |
| GET    | `/api/datasets`     | List datasets  |

---

## 🏗 Architecture

```
User Browser → Azure App Service (Node.js)
                   ↓
          ┌───────┴───────┐
          ↓               ↓
    Cosmos DB       Blob Storage
          ↓               ↓
     Metadata         Files
          ↓
    ┌─────┼─────┐
    ↓     ↓     ↓
GPT-4o  Vision  DocIntel
```

---

## 📝 License

MIT

---

## 👨‍💻 Author

**Rahul Pujari**

- GitHub: [@Rahul-14507](https://github.com/Rahul-14507)
- Email: pujarirahul.pandu@gmail.com
