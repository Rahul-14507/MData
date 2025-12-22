# DataNexus Project Scaffold

A production-grade, scalable data marketplace for the Microsoft Imagine Cup 2026.

## Structure

- `DataNexus_App/`: Flutter Frontend (Web/Mobile).
- `DataNexus_Backend/`: Azure Functions Python Backend.

## 1. Setup DataNexus_App (Frontend)

1.  **Prerequisites**: Ensure Flutter SDK is installed.
2.  **Install Dependencies**:
    ```bash
    cd DataNexus_App
    flutter pub get
    ```
3.  **Configuration**:
    - Open `lib/services/data_upload_service.dart`.
    - Update `_azureSasUrl` with your Azure Container SAS URL (allow Write/Put permissions).
4.  **Run**:
    ```bash
    flutter run -d chrome  # for Web
    # or
    flutter run            # for Mobile
    ```

## 2. Setup DataNexus_Backend (Azure Layer)

1.  **Prerequisites**: Python 3.9+, Azure Functions Core Tools.
2.  **Install Dependencies**:
    ```bash
    cd DataNexus_Backend
    pip install -r requirements.txt
    ```
3.  **Environment Variables**:
    - Rename `local.settings.json.example` to `local.settings.json`.
    - Fill in the values:
      - `AzureWebJobsStorage`: Connection string for the storage account connected to the function.
      - `COSMOS_*`: Your Cosmos DB credentials.
      - `AZURE_OPENAI_*`: Your Azure OpenAI GPT-4o credentials.
      - `VISION_*`: Your Azure AI Vision credentials.
4.  **Run Locally**:
    ```bash
    func start
    ```
5.  **Deploy**:
    ```bash
    func azure functionapp publish <YOUR_FUNCTION_APP_NAME>
    ```

## 3. Architecture Overview

### Frontend

- **Riverpod**: Used for global state management (e.g., user session, upload status).
- **GoRouter**: Handles Deep Linking and navigation.
- **Responsive**: `DashboardScreen` uses `LayoutBuilder` to toggle between Mobile (Column) and Web (Row) layouts.

### Backend

- **Blob Trigger**: Starts execution immediately when a file lands in the `uploads/` container.
- **Azure OpenAI**: Reads text/code files and generates a quality report (QA).
- **Azure Vision**: Generates tags and captions for images.
- **Cosmos DB**: Acts as the system of record for metadata and rewards.
