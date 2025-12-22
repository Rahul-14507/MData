# Azure Action Items (MData)

Based on your current resources (`mdata-db`, `mdata-ai-service`, `mdata-vision`), here are the exact steps you need to perform in the Azure Portal to make the code work.

## 1. Create a Storage Account (Missing)

You do not appear to have a standard Storage Account.

1. Search for **"Storage accounts"** in the Azure Portal.
2. Click **+ Create**.
3. **Resource Group**: `ImagineCupProject`
4. **Name**: `mdatastorage` (must be unique, lowercase).
5. **Review + Create**.
6. **Go to resource** -> **Containers** (left menu).
7. Click **+ Container**:
   - Name: `uploads`
   - Public access level: **Private** (or Blob if you want easy debug).

## 2. Configure Cosmos DB (`mdata-db`)

1. Go to your **`mdata-db`** resource.
2. Click **Data Explorer** (left menu).
3. Click **New Container**:
   - **Database id**: Create new -> `MDataDB`
   - **Container id**: `Submissions`
   - **Partition key**: `/id`
   - Click **OK**.
4. **Create another Container**:
   - **Container id**: `Users`
   - **Partition key**: `/id`

## 3. Configure OpenAI (`mdata-ai-service`)

1. Go to your **`mdata-ai-service`** resource.
2. Click **"Go to Azure OpenAI Studio"** (top bar).
3. Connect to the studio.
4. Go to **Deployments** (left sidebar).
5. Click **Create new deployment**:
   - **Select model**: `gpt-4o`
   - **Deployment name**: `gpt-4o` (Exact match required).
   - Click **Create**.

## 4. Get Connection String for Storage

1. Go back to your new **`mdatastorage`** account.
2. Go to **Access keys** (left menu).
3. Copy the **Connection string** (key1).
4. Update your `local.settings.json`:
   Replace `"AzureWebJobsStorage": "UseDevelopmentStorage=true"` with:
   `"AzureWebJobsStorage": "<PASTE_YOUR_CONNECTION_STRING_HERE>"`

## 5. Configure Firewall (Crucial for Local Dev)

1. Go to **Networking** in your Cosmos DB blade.
2. Click **"Add my current IP"**.
3. Make sure "Allow access from Azure Portal" is checked.
4. Click **Save**.
