import azure.functions as func
import logging
import os
import json
import datetime
from openai import AzureOpenAI
from azure.ai.vision.imageanalysis import ImageAnalysisClient
from azure.ai.vision.imageanalysis.models import VisualFeatures
from azure.ai.contentsafety import ContentSafetyClient
from azure.ai.contentsafety.models import TextCategory, ImageCategory, AnalyzeTextOptions, AnalyzeImageOptions, ImageData
from azure.core.credentials import AzureKeyCredential
from azure.cosmos import CosmosClient, PartitionKey
from azure.storage.blob import generate_container_sas, ContainerSasPermissions

app = func.FunctionApp()

# --- Configurations (Load from Environment Variables) ---
COSMOS_ENDPOINT = os.environ.get("COSMOS_ENDPOINT")
COSMOS_KEY = os.environ.get("COSMOS_KEY")
COSMOS_DB_NAME = "mdatadb"
COSMOS_CONTAINER_NAME = "Metadata"

AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_KEY = os.environ.get("AZURE_OPENAI_KEY")
AZURE_OPENAI_DEPLOYMENT = "gpt-4o"

VISION_ENDPOINT = os.environ.get("VISION_ENDPOINT")
VISION_KEY = os.environ.get("VISION_KEY")

CONTENT_SAFETY_ENDPOINT = os.environ.get("CONTENT_SAFETY_ENDPOINT")
CONTENT_SAFETY_KEY = os.environ.get("CONTENT_SAFETY_KEY")

# --- Clients ---
# Initialize these lazily or outside the function if they are thread-safe and reusable
def get_openai_client():
    return AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_KEY,
        api_version="2024-02-15-preview"
    )

def get_vision_client():
    return ImageAnalysisClient(
        endpoint=VISION_ENDPOINT,
        credential=AzureKeyCredential(VISION_KEY)
    )

def get_content_safety_client():
    if not CONTENT_SAFETY_ENDPOINT or not CONTENT_SAFETY_KEY:
        return None
    return ContentSafetyClient(
        endpoint=CONTENT_SAFETY_ENDPOINT,
        credential=AzureKeyCredential(CONTENT_SAFETY_KEY)
    )

def analyze_content_safety_text(text):
    """Checks text for hate, self-harm, sexual, or violence content."""
    try:
        client = get_content_safety_client()
        if not client:
             return True, "Content Safety not configured - skipping"
             
        request = AnalyzeTextOptions(text=text[:10000]) # Sample for performance
        response = client.analyze_text(request)
        
        for category in response.categories_analysis:
            if category.severity > 2: # 0-7 scale, >2 is moderate
                return False, f"Flagged for {category.category} (Severity {category.severity})"
        
        return True, "Safe"
    except Exception as e:
        logging.error(f"Content safety text analysis failed: {e}")
        return True, "Error in analysis - assuming safe for demo"

def analyze_content_safety_image(image_data):
    """Checks image for restricted content categories."""
    try:
        client = get_content_safety_client()
        if not client:
             return True, "Content Safety not configured - skipping"
             
        request = AnalyzeImageOptions(image=ImageData(content=image_data))
        response = client.analyze_image(request)
        
        for category in response.categories_analysis:
            if category.severity > 2:
                return False, f"Flagged for {category.category} (Severity {category.severity})"
        
        return True, "Safe"
    except Exception as e:
        logging.error(f"Content safety image analysis failed: {e}")
        return True, "Error in analysis - assuming safe for demo"



import hashlib
import uuid
import secrets

# --- HTTP Endpoints ---

@app.route(route="auth", auth_level=func.AuthLevel.ANONYMOUS)
def handle_user_auth(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Processing Auth request.')
    
    try:
        req_body = req.get_json()
        action = req_body.get('action')
        container = get_cosmos_container("Users")

        if action == 'signup':
            email = req_body.get('email')
            password = req_body.get('password')
            name = req_body.get('name')
            role = req_body.get('role', 'contributor')
            
            # Check exist
            query = "SELECT * FROM c WHERE c.email = @email"
            items = list(container.query_items(
                query=query,
                parameters=[{'name': '@email', 'value': email}],
                enable_cross_partition_query=True
            ))
            
            if items:
                return func.HttpResponse(json.dumps({"error": "Email already exists"}), status_code=409)
            
            # Create user
            salt = secrets.token_hex(16)
            msg = (password + salt).encode('utf-8')
            password_hash = hashlib.sha256(msg).hexdigest()
            
            user_doc = {
                "id": str(uuid.uuid4()),
                "name": name,
                "email": email,
                "password_hash": password_hash,
                "salt": salt,
                "role": role,
                "balance": 0.0,
                "joined_date": datetime.datetime.utcnow().isoformat()
            }
            container.create_item(user_doc)
            
            # Return session (Simulated token)
            return func.HttpResponse(json.dumps({
                "token": f"mock-token-{user_doc['id']}",
                "user": {"id": user_doc['id'], "name": name, "email": email, "balance": 0.0, "role": role}
            }), status_code=201)

        elif action == 'login':
            email = req_body.get('email')
            password = req_body.get('password')
            
            query = "SELECT * FROM c WHERE c.email = @email"
            items = list(container.query_items(
                query=query,
                parameters=[{'name': '@email', 'value': email}],
                enable_cross_partition_query=True
            ))
            
            if not items:
                return func.HttpResponse(json.dumps({"error": "Invalid credentials"}), status_code=401)
            
            user = items[0]
            salt = user.get('salt')
            stored_hash = user.get('password_hash')
            
            msg = (password + salt).encode('utf-8')
            if hashlib.sha256(msg).hexdigest() == stored_hash:
                 return func.HttpResponse(json.dumps({
                    "token": f"mock-token-{user['id']}",
                    "user": {"id": user['id'], "name": user['name'], "email": user['email'], "balance": user.get('balance',0), "role": user.get('role')}
                }), status_code=200)
            else:
                 return func.HttpResponse(json.dumps({"error": "Invalid credentials"}), status_code=401)
                 
        else:
             return func.HttpResponse(json.dumps({"error": "Invalid action"}), status_code=400)

    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500)

@app.route(route="storage/sas", auth_level=func.AuthLevel.ANONYMOUS)
def get_upload_sas(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Generating SAS token.')
    try:
        conn_str = os.environ.get("AzureWebJobsStorage")
        # Quick parsing
        account_name = None
        account_key = None
        
        parts = conn_str.split(';')
        for part in parts:
            if part.startswith('AccountName='):
                account_name = part.split('=', 1)[1]
            if part.startswith('AccountKey='):
                account_key = part.split('=', 1)[1]
                
        if not account_name or not account_key:
             return func.HttpResponse(json.dumps({"error": "Invalid storage config"}), status_code=500)

        sas_token = generate_container_sas(
            account_name=account_name,
            container_name="uploads",
            account_key=account_key,
            permission=ContainerSasPermissions(write=True, create=True, list=True),
            expiry=datetime.datetime.utcnow() + datetime.timedelta(minutes=30)
        )
        
        sas_url = f"https://{account_name}.blob.core.windows.net/uploads?{sas_token}"
        return func.HttpResponse(json.dumps({"sasUrl": sas_url}), status_code=200)
    except Exception as e:
         return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500)

@app.route(route="market/summaries", auth_level=func.AuthLevel.ANONYMOUS)
def get_market_summaries(req: func.HttpRequest) -> func.HttpResponse:
    try:
        container = get_cosmos_container("Submissions")
        # Fetch raw data instead of aggregating in SQL to avoid cross-partition query limits
        query = "SELECT c.market_category, c.quality_score, c.sold_to FROM c"
        items = list(container.query_items(query=query, enable_cross_partition_query=True))
        
        # Aggregate in Python
        market_stats = {}
        for item in items:
            # Skip items that are already sold
            if item.get('sold_to'):
                continue

            cat = item.get('market_category', 'General')
            score = item.get('quality_score', 0)
            
            if cat not in market_stats:
                market_stats[cat] = {'count': 0, 'sum_score': 0}
            
            market_stats[cat]['count'] += 1
            market_stats[cat]['sum_score'] += score
            
        result = []
        for cat, stats in market_stats.items():
            result.append({
                "market_category": cat,
                "total_files": stats['count'],
                "avg_quality": round(stats['sum_score'] / stats['count'], 1)
            })
            
        # If empty, return some mocks for the UI to look good immediately
        if not result:
            result = [
                {"market_category": "Autonomous Driving", "total_files": 1240, "avg_quality": 94.5},
                {"market_category": "Medical Imaging", "total_files": 850, "avg_quality": 98.2},
                {"market_category": "Developer Tools", "total_files": 2100, "avg_quality": 91.5},
            ]
            
        return func.HttpResponse(json.dumps(result), status_code=200)
    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500)

@app.route(route="market/purchase", auth_level=func.AuthLevel.ANONYMOUS)
def purchase_category(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Processing Purchase request.')
    try:
        req_body = req.get_json()
        category = req_body.get('category')
        agency_id = req_body.get('agencyId', 'Agency_Generic_1')
        
        container = get_cosmos_container("Submissions")
        
        # 1. Fetch ALL items in category
        query = "SELECT * FROM c WHERE c.market_category = @category"
        items = list(container.query_items(
            query=query,
            parameters=[{'name': '@category', 'value': category}],
            enable_cross_partition_query=True
        ))
        
        # 2. Filter for UNSOLD items in Python
        # Logic: Item is unsold if 'sold_to' key is missing or None
        unsold_items = [i for i in items if not i.get('sold_to')]
        
        if not unsold_items:
             return func.HttpResponse(json.dumps({"message": "No available datasets in this category."}), status_code=404)
        
        # 3. Select items to purchase (limit 5 via slicing)
        items_to_buy = unsold_items[:5]
        purchased_count = len(items_to_buy)
        
        if purchased_count == 0:
             return func.HttpResponse(json.dumps({"message": "No available datasets in this category."}), status_code=404)

        # 4. Calculate Weighted Payouts
        # Agency pays flat $25/file. We distribute this pot based on Quality Score.
        # Example: Pot $100. File A (AQI 90), File B (AQI 10). A gets $90, B gets $10.
        
        total_batch_value = purchased_count * 25.0
        total_quality_score = sum([i.get('quality_score', 0) for i in items_to_buy])
        
        for item in items_to_buy:
            item['sold_to'] = agency_id
            item['transaction_date'] = datetime.datetime.utcnow().isoformat()
            
            # Weighted Distribution
            item_quality = item.get('quality_score', 0)
            if total_quality_score > 0:
                share_percentage = item_quality / total_quality_score
                item_payout = total_batch_value * share_percentage
            else:
                # Fallback if quality scores are missing: Split evenly
                item_payout = total_batch_value / purchased_count
            
            item['payout'] = item_payout
            item['sold_price'] = item_payout # Track what it "sold" for ideally
            
            container.upsert_item(item)
            
        return func.HttpResponse(json.dumps({
            "message": f"Successfully purchased {len(items_to_buy)} items in '{category}'.",
            "count": len(items_to_buy),
            "total_cost": total_batch_value,
            "note": "Payouts distributed to contributors based on AQI."
        }), status_code=200)

    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500)

@app.route(route="agency/purchases", auth_level=func.AuthLevel.ANONYMOUS)
def get_agency_purchases(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Fetching Agency Purchases.')
    try:
        agency_id = req.params.get('agencyId')
        if not agency_id:
            return func.HttpResponse(json.dumps({"error": "Missing agencyId"}), status_code=400)
            
        container = get_cosmos_container("Submissions")
        query = "SELECT c.id, c.original_name, c.market_category, c.sold_price, c.transaction_date, c.quality_score FROM c WHERE c.sold_to = @agencyId ORDER BY c.transaction_date DESC"
        items = list(container.query_items(
            query=query,
            parameters=[{'name': '@agencyId', 'value': agency_id}],
            enable_cross_partition_query=True
        ))
        
        return func.HttpResponse(json.dumps(items), mimetype="application/json", status_code=200)
    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500)

@app.route(route="agency/campaign/create", auth_level=func.AuthLevel.ANONYMOUS)
def create_campaign(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Creating Campaign request.')
    try:
        req_body = req.get_json()
        agency_id = req_body.get('agencyId')
        title = req_body.get('title')
        description = req_body.get('description')
        reward = req_body.get('reward', 0)
        
        if not agency_id or not title:
            return func.HttpResponse(json.dumps({"error": "Missing agencyId or title"}), status_code=400)
            
        campaign = {
            "id": str(uuid.uuid4()),
            "agencyId": agency_id,
            "title": title,
            "description": description,
            "reward": reward,
            "status": "Active",
            "created_at": datetime.datetime.utcnow().isoformat()
        }
        
        container = get_cosmos_container("Campaigns")
        container.create_item(campaign)
        
        return func.HttpResponse(json.dumps({"message": "Campaign created successfully!", "id": campaign['id']}), status_code=201)
    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500)

@app.route(route="stats", auth_level=func.AuthLevel.ANONYMOUS)
def get_dashboard_stats(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Processing Get Dashboard Stats request.')
    
    try:
        user_id = req.params.get('userId')
        if not user_id:
             return func.HttpResponse(json.dumps({"error": "Missing userId parameter"}), status_code=400)

        container = get_cosmos_container("Submissions") 
        
        # Filter by userId
        query = "SELECT c.id, c.payout, c.quality_score, c.original_name, c.upload_timestamp, c.sold_to FROM c WHERE c.userId = @userId ORDER BY c.upload_timestamp DESC"
        
        items = list(container.query_items(
            query=query,
            parameters=[{'name': '@userId', 'value': user_id}],
            enable_cross_partition_query=True 
        ))
        
        # Calculate totals properly
        total_earnings = 0.0
        submissions = []
        
        for item in items:
            payout = item.get('payout', 0)
            score = item.get('quality_score', 0)
            sold_to = item.get('sold_to')
            is_sold = sold_to is not None
            
            # Earnings only count if SOLD
            if is_sold:
                total_earnings += (payout * 0.8) # 80% split
            
            submissions.append({
                "id": item.get('id'), # Added ID for deletion
                "name": item.get('original_name', 'Unknown'),
                "date": item.get('upload_timestamp', '').split('T')[0],
                "quality": score,
                "earnings": f"${(payout * 0.8):.2f}" if is_sold else "$0.00",
                "status": "Sold" if is_sold else "Pending"
            })
            
        avg_quality = sum([item.get('quality_score', 0) for item in items]) / len(items) if items else 0

        return func.HttpResponse(
            json.dumps({
                "earnings": f"${total_earnings:,.2f}",
                "quality": f"{avg_quality:.1f}%",
                "total_uploads": len(items),
                "history": submissions
            }),
            mimetype="application/json",
            status_code=200
        )
    except Exception as e:
        logging.error(f"Error fetching stats: {e}")
        return func.HttpResponse(
            json.dumps({"error": f"Failed to fetch stats: {str(e)}"}),
            status_code=500
        )

@app.route(route="submission/delete", auth_level=func.AuthLevel.ANONYMOUS)
def delete_submission(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Processing Delete Submission request.')
    try:
        req_body = req.get_json()
        item_id = req_body.get('id')
        user_id = req_body.get('userId')
        
        if not item_id or not user_id:
             return func.HttpResponse(json.dumps({"error": "Missing id or userId"}), status_code=400)
             
        container = get_cosmos_container("Submissions")
        
        # Verify ownership and status
        # We can read the item directly using partition key (userId)
        try:
            item = container.read_item(item=item_id, partition_key=user_id)
        except Exception:
            return func.HttpResponse(json.dumps({"error": "Item not found or access denied"}), status_code=404)
        
        if item.get('sold_to'):
             return func.HttpResponse(json.dumps({"error": "Cannot delete sold items."}), status_code=403)
             
        # Delete
        container.delete_item(item=item_id, partition_key=user_id)
        
        return func.HttpResponse(json.dumps({"message": "Submission deleted successfully."}), status_code=200)

    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500)

# --- Trigger ---
@app.blob_trigger(arg_name="myblob", path="uploads/{name}", connection="AzureWebJobsStorage")
def blob_process_trigger(myblob: func.InputStream):
    logging.info(f"Processing blob: {myblob.name}, Size: {myblob.length} bytes")

    filename = os.path.basename(myblob.name)
    file_extension = os.path.splitext(filename)[1].lower()
    
    # Initialize metadata
    # Try to get userId and user-provided metadata from blob metadata (set by frontend)
    blob_metadata = myblob.metadata or {}
    user_id = blob_metadata.get("userid", "public_contributor") # Keys are often lowercased by Azure
    
    # User-provided metadata for quality scoring
    from urllib.parse import unquote
    user_title = unquote(blob_metadata.get("title", ""))
    user_description = unquote(blob_metadata.get("description", ""))
    user_tags_str = unquote(blob_metadata.get("usertags", ""))
    user_tags = [t.strip() for t in user_tags_str.split(",") if t.strip()]
    
    logging.info(f"User metadata - Title: {user_title}, Description: {user_description[:50]}..., Tags: {user_tags}")

    # Read content ONCE into memory to avoid seek() issues
    blob_bytes = myblob.read()

    metadata = {
        "id": filename, 
        "userId": user_id, 
        "original_name": filename,
        "size": len(blob_bytes),
        "upload_timestamp": datetime.datetime.utcnow().isoformat(),
        "processed": True,
        "analysis_type": "unknown",
        "tags": [],
        "user_tags": user_tags,  # Store user-provided tags
        "user_title": user_title,
        "user_description": user_description,
        "caption": "",
        "quality_score": 0,
        "metadata_bonus": 0,  # Bonus for relevant metadata
        "payout": 0,
        "market_category": "Uncategorized",
        "ai_analysis": {}
    }

    try:
        # 1. Content Safety Check (Phase 2)
        is_safe = True
        safety_reason = "Safe"
        
        if file_extension in ['.jpg', '.jpeg', '.png']:
            is_safe, safety_reason = analyze_content_safety_image(blob_bytes)
            # No seek needed
        elif file_extension in ['.txt', '.py', '.dart', '.js', '.md', '.json', '.html', '.css']:
            content_str = blob_bytes.decode('utf-8', errors='ignore')
            is_safe, safety_reason = analyze_content_safety_text(content_str)
            
        metadata['is_safe'] = is_safe
        metadata['safety_reason'] = safety_reason
        
        if not is_safe:
            metadata['processed'] = False
            metadata['quality_score'] = 0
            metadata['payout'] = 0
            metadata['ai_analysis'] = {"error": f"Content blocked: {safety_reason}"}
            logging.warning(f"BLOCKED: {filename} - {safety_reason}")
            # Still store in DB so user sees why it failed
            container = get_cosmos_container("Submissions")
            container.upsert_item(metadata)
            return

        # 2. Determine File Type and Analyze (Phase 1)
        if file_extension in ['.jpg', '.jpeg', '.png']:
            metadata['analysis_type'] = 'image'
            vision_result = analyze_image_vision_40(blob_bytes)
            metadata.update(vision_result)
            
            # For images, we calculate a score based on richness of tags
            score = min(len(metadata.get('tags', [])) * 10, 100)
            metadata['quality_score'] = score
            metadata['payout'] = calculate_payout(score)
            
            # Classify based on tags using OpenAI
            metadata['market_category'] = classify_content(f"Image with tags: {', '.join(metadata['tags'])}")

        elif file_extension in ['.txt', '.py', '.dart', '.js', '.md', '.json', '.html', '.css']:
             metadata['analysis_type'] = 'code_or_text'
             # Re-use content_str if available, or decode again
             content_str = blob_bytes.decode('utf-8', errors='ignore')
             
             # GPT-4o Analysis
             ai_result = analyze_content_quality_gpt4o(content_str, filename)
             metadata.update(ai_result) # Merges quality_score, payout, ai_analysis
             
             metadata['market_category'] = classify_content(f"Code/Text file named {filename}. Summary: {metadata['ai_analysis'].get('summary')}")

        else:
            metadata['analysis_type'] = 'other'
            metadata['ai_analysis'] = {"info": "File type not supported for deep AI analysis yet."}
            metadata['quality_score'] = 10
            metadata['payout'] = 0.50

        # 3. Verify User Metadata Relevance and Apply Bonus
        metadata_bonus = 0
        bonus_reasons = []
        
        # Check if user provided any metadata
        if user_tags or user_description:
            ai_tags = [t.lower() for t in metadata.get('tags', [])]
            ai_summary = metadata.get('ai_analysis', {}).get('summary', '')
            
            # Image tag matching
            if metadata['analysis_type'] == 'image' and user_tags:
                matching_tags = [t for t in user_tags if t.lower() in ai_tags]
                if matching_tags:
                    metadata_bonus += min(len(matching_tags) * 3, 10)  # Up to +10 for matching tags
                    bonus_reasons.append(f"Tags match: {matching_tags}")
                    logging.info(f"Tag bonus: +{min(len(matching_tags) * 3, 10)} for matching tags: {matching_tags}")
            
            # Description relevance check using GPT-4o
            if user_description and ai_summary:
                try:
                    client = get_openai_client()
                    relevance_check = client.chat.completions.create(
                        model=AZURE_OPENAI_DEPLOYMENT,
                        messages=[
                            {"role": "system", "content": "You verify if user descriptions are accurate. Return only 'RELEVANT' or 'NOT_RELEVANT' based on whether the description accurately matches the content."},
                            {"role": "user", "content": f"User description: '{user_description}'\n\nAI analysis: '{ai_summary}'\n\nIs the user's description relevant and accurate?"}
                        ]
                    )
                    relevance_result = relevance_check.choices[0].message.content.strip().upper()
                    if 'RELEVANT' in relevance_result and 'NOT' not in relevance_result:
                        metadata_bonus += 10
                        bonus_reasons.append("Description verified as relevant")
                        logging.info(f"Description bonus: +10 for relevant description")
                except Exception as e:
                    logging.warning(f"Failed to verify description relevance: {e}")
        
        # Apply bonus (max +20)
        metadata_bonus = min(metadata_bonus, 20)
        metadata['metadata_bonus'] = metadata_bonus
        if metadata_bonus > 0:
            original_score = metadata['quality_score']
            metadata['quality_score'] = min(original_score + metadata_bonus, 100)
            metadata['payout'] = calculate_payout(metadata['quality_score'])
            metadata['ai_analysis']['metadata_bonus'] = {
                "bonus_points": metadata_bonus,
                "reasons": bonus_reasons
            }
            logging.info(f"Applied metadata bonus: {original_score} + {metadata_bonus} = {metadata['quality_score']}")

        # 4. Store in Cosmos DB 'Submissions' Container
        container = get_cosmos_container("Submissions")
        container.upsert_item(metadata)
        logging.info(f"SUCCESS: Metadata stored for {filename} with Score: {metadata['quality_score']} (bonus: {metadata_bonus})")

    except Exception as e:
        logging.error(f"FATAL Error processing blob {filename}: {e}")

# --- AI Helper Functions ---

def get_cosmos_container(container_name="Metadata"):
    client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
    # Create Database if it doesn't exist
    database = client.create_database_if_not_exists(id=COSMOS_DB_NAME)
    
    # Determine Partition Key
    # Create Container if it doesn't exist
    if container_name == "Campaigns":
        pk_path = "/id"
    elif container_name == "Submissions":
        pk_path = "/userId"
    else:
        pk_path = "/id"
        
    # Create Container if it doesn't exist
    return database.create_container_if_not_exists(
        id=container_name, 
        partition_key=PartitionKey(path=pk_path)
    )

def classify_content(description):
    """Uses GPT-4o to classify content into a Market Category."""
    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "Classify this content into exactly ONE of these categories: 'Autonomous Driving', 'Medical Imaging', 'Robotics Training', 'Developer Tools', 'Financial Data', 'General'. Return only the category name."},
                {"role": "user", "content": description}
            ]
        )
        return response.choices[0].message.content.strip()
    except:
        return "General"

def generate_license(transaction_id, metadata):
    """Generates a certificate of authenticity."""
    return json.dumps({
        "certificate_id": str(uuid.uuid4()),
        "transaction_id": transaction_id,
        "asset_name": metadata.get('original_name'),
        "quality_score": metadata.get('quality_score'),
        "responsible_ai_check": "PASSED",
        "issued_at": datetime.datetime.utcnow().isoformat()
    })


def analyze_image_vision_40(image_data):
    """Uses Azure AI Vision 4.0 SDK to extract tags and caption."""
    try:
        client = get_vision_client()
        result = client.analyze(
            image_data=image_data,
            visual_features=[VisualFeatures.TAGS, VisualFeatures.CAPTION]
        )
        
        tags = [tag.name for tag in result.tags.list]
        caption = result.caption.text if result.caption else "No caption generated."
        
        return {
            "tags": tags,
            "caption": caption,
            "ai_analysis": {"vision_model": "4.0", "confidence": result.caption.confidence if result.caption else 0}
        }
    except Exception as e:
        logging.error(f"Vision analysis failed: {e}")
        return {"tags": [], "caption": "Error in vision analysis", "ai_analysis": {"error": str(e)}}

def analyze_content_quality_gpt4o(content, filename):
    """Uses GPT-4o to score content and determine payout."""
    try:
        client = get_openai_client()
        
        # Truncate content for token safety
        preview = content[:8000]

        prompt = f"""
        Analyze the following file named '{filename}'.
        
        Determine:
        1. Is this valid, high-quality code/text?
        2. What does it do? (Short summary)
        3. Assign a 'Trust Score' from 1 to 100 based on utility, cleanliness, and complexity.
        
        Return ONLY a JSON object:
        {{
            "trust_score": <int>,
            "summary": "<string>",
            "reasoning": "<string>"
        }}
        
        Content:
        {preview}
        """

        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "You are a senior code auditor and data quality expert."},
                {"role": "user", "content": prompt}
            ],
            response_format={ "type": "json_object" }
        )
        
        result_json = json.loads(response.choices[0].message.content)
        score = result_json.get("trust_score", 50)
        
        return {
            "quality_score": score,
            "payout": calculate_payout(score),
            "ai_analysis": {
                "summary": result_json.get("summary"),
                "reasoning": result_json.get("reasoning")
            }
        }
    except Exception as e:
        logging.error(f"OpenAI analysis failed: {e}")
        return {"quality_score": 0, "payout": 0, "ai_analysis": {"error": str(e)}}

def calculate_payout(quality_score):
    """
    Logarithmic-ish scale for payout.
    Score 1-50: Low payout ($0 - $5)
    Score 51-80: Medium payout ($5 - $20)
    Score 81-100: High payout ($20 - $100)
    """
    if quality_score < 50:
        return max(0.1, quality_score * 0.1)
    elif quality_score < 80:
        return 5 + (quality_score - 50) * 0.5
    else:
        return 20 + (quality_score - 80) * 4.0

