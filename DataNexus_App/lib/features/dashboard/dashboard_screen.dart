import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:data_nexus/features/dashboard/dashboard_provider.dart';
import 'package:data_nexus/services/data_upload_service.dart';
import 'package:data_nexus/features/auth/auth_provider.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  bool _isUploading = false;

  Future<void> _pickAndUpload() async {
    FilePickerResult? result = await FilePicker.platform.pickFiles(
      withData: true, // Needed for Web
      type: FileType.any,
    );

    if (result != null) {
      setState(() => _isUploading = true);
      
      try {
        final file = result.files.first;
        final bytes = file.bytes;
        final name = file.name;
        
        if (bytes != null) {
          // Get current user ID for partitioning
          final user = ref.read(authProvider);
          final userId = user?.id ?? 'guest_user';

          // In a real app, determine mimeType properly
          await ref.read(dataUploadServiceProvider).uploadFile(name, bytes, 'application/octet-stream', userId);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Upload Successful! Processing...')));
          
          // Wait for Azure Function to process (Blob Trigger -> Cosmos DB)
          await Future.delayed(const Duration(seconds: 6));
          
          // Refresh stats
          ref.invalidate(dashboardStatsProvider);
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload Failed: $e')));
      } finally {
        setState(() => _isUploading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final statsAsync = ref.watch(dashboardStatsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('MData Dashboard'),
        actions: [
          _isUploading 
            ? const Padding(padding: EdgeInsets.all(12.0), child: CircularProgressIndicator())
            : IconButton(
                icon: const Icon(Icons.upload_file),
                onPressed: _pickAndUpload,
                tooltip: 'Upload Data',
              ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authProvider.notifier).logout(),
            tooltip: 'Logout',
          ),
        ],
      ),
      // Drawer removed as per request
      body: statsAsync.when(
        data: (stats) => LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth > 800) {
              return _buildWideLayout(context, stats, ref);
            } else {
              return _buildNarrowLayout(context, stats, ref);
            }
          },
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Error: $err')),
      ),
    );
  }

  Widget _buildWideLayout(BuildContext context, DashboardStats stats, WidgetRef ref) {
    return SingleChildScrollView(
      child: Column(
        children: [
          _buildMainStats(context, stats),
          _buildSubmissionHistory(context, stats, ref),
        ],
      ),
    );
  }

  Widget _buildNarrowLayout(BuildContext context, DashboardStats stats, WidgetRef ref) {
    return SingleChildScrollView(
      child: Column(
        children: [
          _buildMainStats(context, stats),
          const Divider(),
          _buildSubmissionHistory(context, stats, ref),
        ],
      ),
    );
  }

  Widget _buildMainStats(BuildContext context, DashboardStats stats) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Overview', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(child: _StatCard(title: 'Total Earnings', value: stats.earnings, icon: Icons.attach_money, color: Colors.green)),
              const SizedBox(width: 16),
              Expanded(child: _StatCard(title: 'Quality Index', value: stats.quality, icon: Icons.verified, color: Colors.blue)),
              const SizedBox(width: 16),
              Expanded(child: _StatCard(title: 'Total Uploads', value: '${stats.totalUploads}', icon: Icons.cloud_upload, color: Colors.orange)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSubmissionHistory(BuildContext context, DashboardStats stats, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Your Submissions', style: Theme.of(context).textTheme.headlineSmall),
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () => ref.invalidate(dashboardStatsProvider),
                tooltip: 'Refresh Data',
              ),
            ],
          ),
          const SizedBox(height: 10),
          Card(
            clipBehavior: Clip.antiAlias,
            child: SizedBox(
               width: double.infinity,
               child: DataTable(
                headingRowColor: MaterialStateProperty.all(Theme.of(context).colorScheme.surfaceContainerHighest),
                columns: const [
                  DataColumn(label: Text('Filename')),
                  DataColumn(label: Text('Date')),
                  DataColumn(label: Text('Quality')),
                  DataColumn(label: Text('Status')),
                  DataColumn(label: Text('Earnings')),
                  DataColumn(label: Text('Action')),
                ],
                rows: stats.history.map((item) {
                  final isSold = item['status'] == 'Sold';
                  return DataRow(cells: [
                    DataCell(Row(children: [
                       const Icon(Icons.insert_drive_file, size: 16, color: Colors.blueGrey), 
                       const SizedBox(width: 8), 
                       Text(item['name'] ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.bold))
                    ])),
                    DataCell(Text(item['date'] ?? '')),
                    DataCell(_buildQualityBadge(item['quality'] ?? 0)),
                    DataCell(Row(children: [
                       Icon(isSold ? Icons.check_circle : Icons.hourglass_empty, size: 16, color: isSold ? Colors.green : Colors.orange),
                       const SizedBox(width: 4),
                       Text(item['status'] ?? 'Pending', style: TextStyle(color: isSold ? Colors.green : Colors.orange, fontWeight: FontWeight.bold)),
                    ])),
                    DataCell(Text(item['earnings'] ?? '\$0.00')),
                    DataCell(
                      IconButton(
                        icon: Icon(Icons.delete, color: isSold ? Colors.grey : Colors.red),
                        onPressed: isSold ? null : () => _deleteSubmission(context, ref, item['id']),
                        tooltip: isSold ? 'Cannot delete sold item' : 'Delete Submission',
                      )
                    ),
                  ]);
                }).toList(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQualityBadge(num score) {
    Color color = score > 80 ? Colors.green : (score > 50 ? Colors.orange : Colors.red);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.2), borderRadius: BorderRadius.circular(12)),
      child: Text('$score', style: TextStyle(color: color, fontWeight: FontWeight.bold)),
    );
  }

  Future<void> _deleteSubmission(BuildContext context, WidgetRef ref, String? itemId) async {
    if (itemId == null) return;
    
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Submission?'),
        content: const Text('Are you sure you want to remove this file? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );

    if (confirm == true) {
      final user = ref.read(authProvider);
      if (user == null) return;

      try {
        final res = await http.post(
          Uri.parse('http://localhost:7071/api/submission/delete'),
          body: json.encode({'id': itemId, 'userId': user.id}),
        );
        
        if (context.mounted) {
           if (res.statusCode == 200) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Submission deleted.')));
              ref.invalidate(dashboardStatsProvider);
           } else {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: ${res.body}')));
           }
        }
      } catch (e) {
        if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({required this.title, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            Icon(icon, size: 32, color: color),
            const SizedBox(height: 8),
            Text(value, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
            Text(title, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}
