import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:flutter_riverpod/flutter_riverpod.dart';

// This would typically come from an environment variable or secure storage
const String _azureSasUrl = "https://mdatastorage1.blob.core.windows.net/?sv=2024-11-04&ss=b&srt=sco&sp=rwlactfx&se=2026-12-19T21:30:35Z&st=2025-12-19T13:15:35Z&spr=https&sig=b%2FvYLQtmlTdM3C7DUNwBon8pMnNaZTN%2BOhalcRSYR70%3D"; 

class DataUploadService {
  Future<void> uploadFile(String fileName, Uint8List fileBytes, String mimeType, String userId) async {
    // Parse the Account SAS URL provided by the user
    final sasUri = Uri.parse(_azureSasUrl);
    
    // Construct the full Blob URL: https://<account>.blob.core.windows.net/uploads/<filename>?<sas_token>
    // We assume the container name is 'uploads' as per the guide.
    final uploadUrl = '${sasUri.origin}/uploads/$fileName?${sasUri.query}';

    try {
      final response = await http.put(
        Uri.parse(uploadUrl),
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': mimeType,
          'x-ms-meta-userid': userId, // Store User ID in Blob Metadata for Partition Key
        },
        body: fileBytes,
      );

      if (response.statusCode != 201) {
        throw Exception('Failed to upload: ${response.statusCode} ${response.body}');
      }
    } catch (e) {
      throw Exception('Upload error: $e');
    }
  }
}

final dataUploadServiceProvider = Provider<DataUploadService>((ref) {
  return DataUploadService();
});
