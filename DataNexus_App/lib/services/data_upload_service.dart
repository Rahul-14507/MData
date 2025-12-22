import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:io'; // Added for File and Platform
import 'dart:convert'; // Added for json.decode

class DataUploadService {
  Future<void> uploadFile(String fileName, Uint8List fileBytes, String userId) async {
    try {
      // 1. Get SAS Token from Backend
      final sasRes = await http.get(Uri.parse('http://localhost:7071/api/storage/sas'));
      if (sasRes.statusCode != 200) throw Exception('Failed to get upload token: ${sasRes.body}');
      
      final sasUrl = json.decode(sasRes.body)['sasUrl'];
      
      // 2. Upload to Blob Storage
      // sasUrl is like https://account.blob.../uploads?sig=...
      // We need to insert the filename: https://account.blob.../uploads/filename?sig=...
      final uri = Uri.parse(sasUrl);
      final uploadUri = uri.replace(path: '${uri.path}/$fileName');

      final request = http.Request('PUT', uploadUri);
      request.headers['x-ms-blob-type'] = 'BlockBlob';
      request.headers['x-ms-meta-userid'] = userId; // Important for partitioning
      
      request.bodyBytes = fileBytes;

      final response = await request.send();

      if (response.statusCode != 201) {
        throw Exception('Upload failed: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Upload error: $e');
    }
  }
}

final dataUploadServiceProvider = Provider<DataUploadService>((ref) {
  return DataUploadService();
});
