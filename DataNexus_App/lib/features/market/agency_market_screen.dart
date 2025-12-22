import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:data_nexus/features/auth/auth_provider.dart';

final marketSummaryProvider = FutureProvider((ref) async {
  const url = 'http://localhost:7071/api/market/summaries';
  final res = await http.get(Uri.parse(url));
  if (res.statusCode != 200) throw Exception('Failed to load market data');
  return json.decode(res.body) as List<dynamic>;
});

final agencyPurchasesProvider = FutureProvider.family<List<dynamic>, String>((ref, agencyId) async {
  final url = 'http://localhost:7071/api/agency/purchases?agencyId=$agencyId';
  final res = await http.get(Uri.parse(url));
  if (res.statusCode != 200) throw Exception('Failed to load purchases');
  return json.decode(res.body) as List<dynamic>;
});

class AgencyMarketScreen extends ConsumerStatefulWidget {
  const AgencyMarketScreen({super.key});

  @override
  ConsumerState<AgencyMarketScreen> createState() => _AgencyMarketScreenState();
}

class _AgencyMarketScreenState extends ConsumerState<AgencyMarketScreen> {
  final _campaignTitleController = TextEditingController();
  final _campaignDescController = TextEditingController();
  bool _isCreatingCampaign = false;

  @override
  void dispose() {
    _campaignTitleController.dispose();
    _campaignDescController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider);
    final marketAsync = ref.watch(marketSummaryProvider);
    final purchasesAsync = ref.watch(agencyPurchasesProvider(user?.id ?? 'Agency_Demo_User'));

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Agency Portal'),
          automaticallyImplyLeading: false,
          actions: [
            IconButton(
              icon: const Icon(Icons.logout),
              onPressed: () => ref.read(authProvider.notifier).logout(),
              tooltip: 'Logout',
            ),
          ],
          bottom: const TabBar(
            tabs: [
              Tab(icon: Icon(Icons.store), text: 'Marketplace'),
              Tab(icon: Icon(Icons.campaign), text: 'Campaigns'),
              Tab(icon: Icon(Icons.history), text: 'Purchases'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _buildMarketTab(context, marketAsync),
            _buildCampaignTab(context),
            _buildPurchasesTab(context, purchasesAsync),
          ],
        ),
      ),
    );
  }

  Widget _buildMarketTab(BuildContext context, AsyncValue<List<dynamic>> marketAsync) {
    return marketAsync.when(
      data: (data) => GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 350,
          childAspectRatio: 3 / 2.8,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
        ),
        itemCount: data.length,
        itemBuilder: (context, index) {
          final item = data[index];
          return _MarketCard(
            item: item, 
            onBuy: () => _showPurchaseDialog(context, item['market_category'], item['total_files'])
          );
        },
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e,s) => Center(child: Text('Error: $e')),
    );
  }

  Widget _buildCampaignTab(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Create New Data Campaign', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 10),
          Text('Request specific data from our contributor network by creating a bounty.', style: TextStyle(color: Colors.grey[600])),
          const SizedBox(height: 30),
          TextField(
            controller: _campaignTitleController,
            decoration: const InputDecoration(labelText: 'Campaign Title', border: OutlineInputBorder(), hintText: 'e.g. 1000 Images of Road Construction'),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _campaignDescController,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Description / Dataset Reqs', border: OutlineInputBorder(), hintText: 'Describe the quality, angles, lighting, etc.'),
          ),
          const SizedBox(height: 30),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: FilledButton.icon(
              icon: _isCreatingCampaign ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)) : const Icon(Icons.add),
              onPressed: _isCreatingCampaign ? null : _submitCampaign,
              label: const Text('Post Campaign'),
            ),
          )
        ],
      ),
    );
  }

  Widget _buildPurchasesTab(BuildContext context, AsyncValue<List<dynamic>> purchasesAsync) {
    return purchasesAsync.when(
      data: (items) {
        if (items.isEmpty) return const Center(child: Text('No purchases yet.'));
        return ListView.builder(
          itemCount: items.length,
          itemBuilder: (context, index) {
            final item = items[index];
            return ListTile(
              leading: const CircleAvatar(child: Icon(Icons.verified)),
              title: Text(item['original_name']),
              subtitle: Text('${item['market_category']} • Purchased on ${item['transaction_date'].split('T')[0]}'),
              trailing: Text('\$${item['sold_price']}', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green)),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e,s) => Center(child: Text('Error: $e')),
    );
  }

  Future<void> _submitCampaign() async {
    final title = _campaignTitleController.text.trim();
    final desc = _campaignDescController.text.trim();
    final user = ref.read(authProvider);

    if (title.isEmpty || desc.isEmpty) return;

    setState(() => _isCreatingCampaign = true);
    try {
      final res = await http.post(
        Uri.parse('http://localhost:7071/api/agency/campaign/create'),
        body: json.encode({
          'agencyId': user?.id ?? 'Agency_Demo_User',
          'title': title,
          'description': desc,
          'reward': 50.0 // Standard bounty
        }),
      );

      if (mounted) {
        if (res.statusCode == 201) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Campaign Published!')));
          _campaignTitleController.clear();
          _campaignDescController.clear();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: ${res.body}')));
        }
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _isCreatingCampaign = false);
    }
  }

  Future<void> _showPurchaseDialog(BuildContext context, String category, int count) async {
    final double cost = count * 25.0;
    
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Purchase $category Batch?'),
        content: Text('This will grant you license to $count premium files.\n\nEstimated Cost: \$${cost.toStringAsFixed(2)}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Confirm Purchase')),
        ],
      ),
    );

    if (confirmed == true) {
      if (!context.mounted) return;
      
      try {
        final res = await http.post(
          Uri.parse('http://localhost:7071/api/market/purchase'),
          body: json.encode({'category': category, 'agencyId': 'Agency_Demo_User'}),
        );
        
        if (context.mounted) {
           ScaffoldMessenger.of(context).showSnackBar(
             SnackBar(
               content: Text(res.statusCode == 200 ? 'Purchase Successful! Licenses Generated.' : 'Purchase Failed: ${res.body}'),
               backgroundColor: res.statusCode == 200 ? Colors.green : Colors.red,
             )
           );
        }
      } catch (e) {
         if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }
}

class _MarketCard extends StatelessWidget {
  final dynamic item;
  final VoidCallback onBuy;

  const _MarketCard({required this.item, required this.onBuy});

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(item['market_category'], style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold), maxLines: 1, overflow: TextOverflow.ellipsis),
            const Spacer(),
            _RowInfo('Files Available', '${item['total_files']}'),
            _RowInfo('Avg Quality', '${item['avg_quality']}%'),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                icon: const Icon(Icons.shopping_cart),
                label: const Text('Buy Batch'),
                onPressed: onBuy,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RowInfo extends StatelessWidget {
  final String label;
  final String value;
  const _RowInfo(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  final String label;
  final String value;
  const _StatRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
