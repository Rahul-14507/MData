import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'dart:ui' as ui;

class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0E14),
      extendBodyBehindAppBar: true,
      body: Stack(
        children: [
          // Ambient Background Blobs
          Positioned(
            top: -100,
            left: MediaQuery.of(context).size.width * 0.25,
            child: _AmbientBlob(color: Colors.blue.shade600, delay: 0),
          ),
          Positioned(
            top: 50,
            right: MediaQuery.of(context).size.width * 0.25,
            child: _AmbientBlob(color: Colors.purple.shade600, delay: 2000),
          ),
          
          // Main Scrollable Content
          SingleChildScrollView(
            child: Column(
              children: [
                _buildNavbar(context),
                _HeroSection(),
                _TrustSection(),
                _FeaturesSection(),
                _Footer(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNavbar(BuildContext context) {
    return Container(
      height: 80,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0E14).withOpacity(0.7),
        border: const Border(bottom: BorderSide(color: Colors.white10)),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1280),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Logo
              Row(
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      gradient: LinearGradient(colors: [Colors.blue.shade600, Colors.purple.shade600]),
                      boxShadow: [BoxShadow(color: Colors.blue.shade600.withOpacity(0.3), blurRadius: 10)]
                    ),
                    child: const Icon(Icons.dataset, color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  const Text('DataMarket', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold, fontFamily: 'Outfit')),
                ],
              ),
              
              // Desktop Links
              if (MediaQuery.of(context).size.width > 900)
                Row(
                  children: [
                    _NavLink(text: 'For Uploaders', color: Colors.blue),
                    _NavLink(text: 'For Agencies', color: Colors.purple),
                    const _NavLink(text: 'Marketplace'),
                    const _NavLink(text: 'Safety'),
                  ],
                ),

              // Actions
              Row(
                children: [
                  TextButton(
                    onPressed: () => context.go('/auth'),
                    child: const Text('Login', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(width: 16),
                  ElevatedButton(
                    onPressed: () => context.go('/auth'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                    ),
                    child: const Text('Get Started', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ],
              )
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroSection extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 120, 24, 80),
      alignment: Alignment.center,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1280),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Left Content
              Expanded(
                flex: 5,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                     Container(
                       padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                       decoration: BoxDecoration(
                         borderRadius: BorderRadius.circular(20),
                         color: Colors.white.withOpacity(0.05),
                         border: Border.all(color: Colors.white10),
                       ),
                       child: Row(
                         mainAxisSize: MainAxisSize.min,
                         children: [
                           const Icon(Icons.circle, size: 8, color: Colors.greenAccent),
                           const SizedBox(width: 8),
                           Text('LIVE MARKETPLACE', style: TextStyle(color: Colors.greenAccent.shade200, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                         ],
                       ),
                     ),
                     const SizedBox(height: 24),
                     RichText(
                       text: TextSpan(
                         style: const TextStyle(fontSize: 64, fontWeight: FontWeight.w800, height: 1.1, fontFamily: 'Outfit', color: Colors.white),
                         children: [
                           const TextSpan(text: 'Fueling AI with\n'),
                           TextSpan(
                             text: 'Ethical Data',
                             style: TextStyle(
                               foreground: Paint()..shader = const LinearGradient(colors: [Colors.blueAccent, Colors.purpleAccent]).createShader(const Rect.fromLTWH(0, 0, 400, 70)),
                             ),
                           ),
                         ],
                       ),
                     ),
                     const SizedBox(height: 24),
                     Text(
                       'The bridge between content creators and artificial intelligence. Securely monetize your files or access compliant datasets for next-gen models.',
                       style: TextStyle(color: Colors.grey.shade400, fontSize: 18, height: 1.6),
                     ),
                     const SizedBox(height: 48),
                     Row(
                       children: [
                         ElevatedButton.icon(
                           onPressed: () {},
                           icon: const Icon(Icons.cloud_upload_outlined),
                           label: const Text('Start Uploading'),
                           style: ElevatedButton.styleFrom(
                             backgroundColor: Colors.blue.shade700,
                             foregroundColor: Colors.white,
                             padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
                             shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                             textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                           ),
                         ),
                         const SizedBox(width: 24),
                         OutlinedButton.icon(
                           onPressed: () {},
                           icon: const Icon(Icons.search),
                           label: const Text('Browse Datasets'),
                            style: OutlinedButton.styleFrom(
                             foregroundColor: Colors.white,
                             side: BorderSide(color: Colors.white.withOpacity(0.2)),
                             padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
                             shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                             textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                           ),
                         ),
                       ],
                     ),
                  ],
                ),
              ),
              
              const SizedBox(width: 64),
              
              // Right Visual (3D Card Effect Placeholder)
              if (MediaQuery.of(context).size.width > 900)
                Expanded(
                  flex: 4,
                  child: Container(
                    height: 500,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Colors.grey.shade900, Colors.black]),
                      border: Border.all(color: Colors.white10),
                      boxShadow: [BoxShadow(color: Colors.blue.withOpacity(0.1), blurRadius: 40, spreadRadius: 10)],
                    ),
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: CustomPaint(painter: GridPainter()),
                        ),
                        Center(child: Icon(Icons.auto_graph, size: 120, color: Colors.blue.withOpacity(0.2))),
                        // Floating Badge
                        Positioned(
                          top: 40, right: -20,
                          child: _GlassCard(
                            icon: Icons.check_circle, iconColor: Colors.green,
                            title: 'Verification Complete', subtitle: 'Your dataset is live',
                          ),
                        ),
                        Positioned(
                          bottom: 60, left: -20,
                          child: _GlassCard(
                            icon: Icons.smart_toy, iconColor: Colors.purple,
                            title: 'Model Trained', subtitle: 'Accuracy +4.2%',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TrustSection extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black.withOpacity(0.3),
      padding: const EdgeInsets.symmetric(vertical: 40),
      width: double.infinity,
      child: Column(
        children: [
          Text('TRUSTING THE INFRASTRUCTURE', style: TextStyle(color: Colors.grey.shade600, fontSize: 12, letterSpacing: 2, fontWeight: FontWeight.bold)),
          const SizedBox(height: 32),
          Wrap(
            spacing: 60, runSpacing: 20,
            alignment: WrapAlignment.center,
            children: [
              _TrustLogo(icon: Icons.hexagon, name: 'HexaAI'),
              _TrustLogo(icon: Icons.api, name: 'DataFlow'),
              _TrustLogo(icon: Icons.smart_toy, name: 'RoboLearn'),
              _TrustLogo(icon: Icons.language, name: 'GlobalData'),
            ],
          ),
        ],
      ),
    );
  }
}

class _FeaturesSection extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 120, horizontal: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1280),
        child: Column(
          children: [
            const Text('Choose Your Path', style: TextStyle(color: Colors.white, fontSize: 48, fontWeight: FontWeight.bold, fontFamily: 'Outfit')),
            const SizedBox(height: 16),
            Text('Whether you are looking to monetize your data or train the next generation of AI.', style: TextStyle(color: Colors.grey.shade400, fontSize: 18), textAlign: TextAlign.center),
            const SizedBox(height: 80),
            
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Uploader Card
                Expanded(
                  child: _FeatureCard(
                    title: 'For Uploaders',
                    subtitle: 'MONETIZE ASSETS',
                    description: 'Turn your unused digital assets into a passive income stream. We handle the privacy, you keep the ownership.',
                    accentColor: Colors.blue,
                    icon: Icons.cloud_upload,
                    features: const ['Privacy First Engine', 'Royalties Forever'],
                    buttonText: 'Start Earning',
                  ),
                ),
                const SizedBox(width: 40),
                // Agency Card
                Expanded(
                  child: _FeatureCard(
                    title: 'For Agencies',
                    subtitle: 'TRAIN MODELS',
                    description: 'Access clean, verified, and legally compliant datasets. Stop scraping and start training with confidence.',
                    accentColor: Colors.purple,
                    icon: Icons.psychology,
                    features: const ['Full Legal Compliance', 'Human Verification'],
                    buttonText: 'Explore Catalog',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Colors.white10)),
      ),
      padding: const EdgeInsets.all(80),
      child: Center(child: Text('© 2024 DataMarket Inc.', style: TextStyle(color: Colors.grey.shade600))),
    );
  }
}

// --- Helpers ---

class _NavLink extends StatelessWidget {
  final String text;
  final Color? color;
  const _NavLink({required this.text, this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: TextButton(
        onPressed: () {},
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(text, style: const TextStyle(color: Colors.grey, fontSize: 15, fontWeight: FontWeight.w500)),
            if (color != null) Container(height: 2, width: 0, color: color), // Placeholder for animation
          ],
        ),
      ),
    );
  }
}

class _AmbientBlob extends StatelessWidget {
  final Color color;
  final int delay;
  const _AmbientBlob({required this.color, required this.delay});
  
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 500, height: 500,
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        shape: BoxShape.circle,
      ),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 100, sigmaY: 100),
        child: Container(color: Colors.transparent),
      ),
    );
  }
}

class _GlassCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  
  const _GlassCard({required this.icon, required this.iconColor, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 20)],
      ),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: iconColor.withOpacity(0.2), borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                Text(subtitle, style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TrustLogo extends StatelessWidget {
  final IconData icon;
  final String name;
  const _TrustLogo({required this.icon, required this.name});
  
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: Colors.grey.shade600),
        const SizedBox(width: 8),
        Text(name, style: TextStyle(color: Colors.grey.shade600, fontSize: 18, fontWeight: FontWeight.bold, fontFamily: 'Outfit')),
      ],
    );
  }
}

class _FeatureCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String description;
  final Color accentColor;
  final IconData icon;
  final List<String> features;
  final String buttonText;

  const _FeatureCard({
    required this.title, required this.subtitle, required this.description, 
    required this.accentColor, required this.icon, required this.features, required this.buttonText
  });
  
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(24),
        border: Border(top: BorderSide(color: accentColor.withOpacity(0.5), width: 4), bottom: BorderSide(color: Colors.white10), left: BorderSide(color: Colors.white10), right: BorderSide(color: Colors.white10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
           Row(
             mainAxisAlignment: MainAxisAlignment.spaceBetween,
             children: [
               Column(
                 crossAxisAlignment: CrossAxisAlignment.start,
                 children: [
                   Text(title, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                   const SizedBox(height: 4),
                   Text(subtitle, style: TextStyle(color: accentColor, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
                 ],
               ),
               Container(
                 padding: const EdgeInsets.all(12),
                 decoration: BoxDecoration(color: accentColor.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
                 child: Icon(icon, color: accentColor, size: 32),
               ),
             ],
           ),
           const SizedBox(height: 24),
           Text(description, style: TextStyle(color: Colors.grey.shade400, fontSize: 16, height: 1.6)),
           const SizedBox(height: 32),
           ...features.map((f) => Padding(
             padding: const EdgeInsets.only(bottom: 16),
             child: Row(
               children: [
                 Icon(Icons.check_circle_outline, color: accentColor, size: 20),
                 const SizedBox(width: 12),
                 Text(f, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
               ],
             ),
           )),
           const SizedBox(height: 32),
           SizedBox(
             width: double.infinity,
             height: 56,
             child: OutlinedButton(
               onPressed: () {},
               style: OutlinedButton.styleFrom(
                 foregroundColor: accentColor,
                 side: BorderSide(color: accentColor.withOpacity(0.3)),
                 shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
               ),
               child: Text(buttonText, style: const TextStyle(fontWeight: FontWeight.bold)),
             ),
           ),
        ],
      ),
    );
  }
}

class GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withOpacity(0.05)..strokeWidth = 1;
    for (double i = 0; i < size.width; i += 40) {
      canvas.drawLine(Offset(i, 0), Offset(i, size.height), paint);
    }
    for (double i = 0; i < size.height; i += 40) {
      canvas.drawLine(Offset(0, i), Offset(size.width, i), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
