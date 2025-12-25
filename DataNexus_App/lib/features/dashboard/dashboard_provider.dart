import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';
import 'package:data_nexus/features/auth/auth_provider.dart';
import 'package:data_nexus/core/api_config.dart';

// Model
class DashboardStats {
  final String earnings;
  final String quality;
  final int totalUploads;
  final List<dynamic> history;

  DashboardStats({required this.earnings, required this.quality, required this.totalUploads, required this.history});

  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    return DashboardStats(
      earnings: json['earnings'] ?? '\$0.00',
      quality: json['quality'] ?? '0%',
      totalUploads: json['total_uploads'] ?? 0,
      history: json['history'] ?? [],
    );
  }
}

// Provider
final dashboardStatsProvider = FutureProvider<DashboardStats>((ref) async {
  final user = ref.watch(authProvider); // Watch for user changes
  final userId = user?.id ?? '';

  // Replace with actual URL if different
  final baseUrl = ApiConfig.baseUrl;     
  final String functionUrl = '$baseUrl/api/stats?userId=$userId'; 
  
  try {
    final response = await http.get(Uri.parse(functionUrl));
    if (response.statusCode == 200) {
      return DashboardStats.fromJson(json.decode(response.body));
    } else {
      throw Exception('Failed to load stats');
    }
  } catch (e) {
    // Return dummy data for fallback if backend isn't running yet (Proof of functionality)
    return DashboardStats(
      earnings: '\$1,240.50',
      quality: '98%',
      totalUploads: 15,
      history: [
        {'name': 'Dataset_Mock_1.json', 'status': 'Pending', 'date': '2025-12-19', 'earnings': '\$0.00', 'quality': 85},
        {'name': 'Image_Scan_2.jpg', 'status': 'Sold', 'date': '2025-12-18', 'earnings': '\$12.50', 'quality': 99},
      ]
    );
  }
});
