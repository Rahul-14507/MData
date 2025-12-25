import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:data_nexus/features/auth/auth_provider.dart';
import 'dart:math' as math;

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> with SingleTickerProviderStateMixin {
  bool _isLogin = true;
  bool _obscurePassword = true;
  final _formKey = GlobalKey<FormState>();
  
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _emailFocus = FocusNode();
  final _passFocus = FocusNode();
  String _selectedRole = 'contributor';

  bool _isLoading = false;
  // Avatar State
  bool _isCheckingPassword = false;
  bool _isPeeking = false;

  late AnimationController _animController;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animController, curve: Curves.easeOut),
    );
    
    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _animController, curve: Curves.easeOutCubic));
    
    _animController.forward();

    // Listen to password focus for avatar interaction
    _passFocus.addListener(() {
      setState(() {
        _isCheckingPassword = _passFocus.hasFocus;
      });
    });
  }

  @override
  void dispose() {
    _animController.dispose();
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _emailFocus.dispose();
    _passFocus.dispose();
    super.dispose();
  }

  void _submit() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isLoading = true);
      
      bool success;
      final auth = ref.read(authProvider.notifier);
      
      if (_isLogin) {
        success = await auth.login(_emailCtrl.text, _passCtrl.text);
      } else {
        success = await auth.signup(_nameCtrl.text, _emailCtrl.text, _passCtrl.text, _selectedRole);
      }

      if (mounted) setState(() => _isLoading = false);
      
      if (success) {
        if (mounted) context.go('/'); 
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Authentication Failed'),
              backgroundColor: Colors.red.shade400,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      }
    }
  }

  void _toggleMode() {
    setState(() => _isLogin = !_isLogin);
    _animController.reset();
    _animController.forward();
  }

  void _togglePasswordVisibility() {
    setState(() {
      _obscurePassword = !_obscurePassword;
      _isPeeking = !_obscurePassword;
    });
  }

  @override
  Widget build(BuildContext context) {
    // Ensuring high contrast colors
    final primaryColor = Theme.of(context).colorScheme.primary;
    final backgroundColor = const Color(0xFFF8FAFC);
    final textColor = Colors.grey.shade900;

    return Scaffold(
      backgroundColor: backgroundColor,
      body: Row(
        children: [
          // Left Side: Modern Branding
          if (MediaQuery.of(context).size.width > 900)
            Expanded(
              flex: 5,
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      const Color(0xFF1E293B), // Slate 800
                      const Color(0xFF0F172A), // Slate 900
                    ],
                  ),
                ),
                child: Stack(
                  children: [
                    // Abstract decorative circles
                    Positioned(
                      top: -100,
                      right: -100,
                      child: Container(
                        width: 400,
                        height: 400,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withOpacity(0.03),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 50,
                      left: 50,
                      child: Container(
                        width: 200,
                        height: 200,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: primaryColor.withOpacity(0.1),
                        ),
                      ),
                    ),
                    
                    // Content
                    Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(24),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(32),
                              border: Border.all(color: Colors.white.withOpacity(0.1)),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.2),
                                  blurRadius: 20,
                                  offset: const Offset(0, 10),
                                ),
                              ],
                            ),
                            child: const Icon(Icons.dataset_rounded, size: 80, color: Colors.white),
                          ),
                          const SizedBox(height: 40),
                          Text(
                            'MData',
                            style: Theme.of(context).textTheme.displayLarge?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -1.0,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'The Intelligent Data Marketplace',
                            style: TextStyle(
                              color: Colors.blueGrey.shade100,
                              fontSize: 18,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 60),
                          // Feature Grid
                          SizedBox(
                            width: 400,
                            child: Wrap(
                              spacing: 16,
                              runSpacing: 16,
                              alignment: WrapAlignment.center,
                              children: [
                                _buildFeaturePill(Icons.security, 'Secure Storage'),
                                _buildFeaturePill(Icons.auto_awesome, 'AI Analysis'),
                                _buildFeaturePill(Icons.payments, 'Instant Payouts'),
                                _buildFeaturePill(Icons.api, 'Rest API'),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          
          // Right Side: Login Form with Avatar
          Expanded(
            flex: 6,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    const Color(0xFFF8FAFC), // Slate 50
                    const Color(0xFFE2E8F0), // Slate 200
                  ],
                ),
              ),
              child: Stack(
                children: [
                  // Shadow/Blend Overlay from the left
                  Positioned(
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: 60,
                    child: Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.centerLeft,
                          end: Alignment.centerRight,
                          colors: [
                            Colors.black.withOpacity(0.05),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                  ),

                  Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(32),
                      child: FadeTransition(
                        opacity: _fadeAnimation,
                        child: SlideTransition(
                          position: _slideAnimation,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 420),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                // --- INTERACTIVE AVATAR ---
                                SizedBox(
                            height: 120,
                            child: Center(
                              child: InteractiveAvatar(
                                isCheckingPassword: _isCheckingPassword,
                                isPeeking: _isPeeking,
                                emailTextLength: _emailCtrl.text.length,
                              ),
                            ),
                          ),
                          const SizedBox(height: 24),
                          
                          Text(
                            _isLogin ? 'Welcome Back!' : 'Join MData',
                            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: textColor,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _isLogin 
                              ? 'Please sign in to access your dashboard' 
                              : 'Create an account to start selling data',
                            style: TextStyle(color: Colors.grey.shade600),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 40),

                          Form(
                            key: _formKey,
                            child: Column(
                              children: [
                                if (!_isLogin) ...[
                                  _buildTextField(
                                    controller: _nameCtrl,
                                    label: 'Full Name',
                                    icon: Icons.person_rounded,
                                    validator: (v) => v!.isEmpty ? 'Name is required' : null,
                                    onFieldSubmitted: (_) => _emailFocus.requestFocus(),
                                  ),
                                  const SizedBox(height: 20),
                                  _buildRoleSelector(),
                                  const SizedBox(height: 20),
                                ],

                                _buildTextField(
                                  controller: _emailCtrl,
                                  label: 'Email Address',
                                  icon: Icons.email_rounded,
                                  keyboardType: TextInputType.emailAddress,
                                  focusNode: _emailFocus,
                                  validator: (v) => v!.contains('@') ? null : 'Enter a valid email',
                                  onChanged: (v) {
                                    // Trigger rebuild for avatar tracking if needed (optional)
                                    // setState(() {}); 
                                  },
                                  onFieldSubmitted: (_) => _passFocus.requestFocus(),
                                ),
                                const SizedBox(height: 20),

                                // Password Field with Visibility Toggle
                                TextFormField(
                                  controller: _passCtrl,
                                  focusNode: _passFocus,
                                  obscureText: _obscurePassword,
                                  validator: (v) => v!.length < 6 ? 'Min 6 chars' : null,
                                  onFieldSubmitted: (_) => _submit(),
                                  style: const TextStyle(fontWeight: FontWeight.w500),
                                  decoration: InputDecoration(
                                    labelText: 'Password',
                                    hintText: '••••••',
                                    floatingLabelBehavior: FloatingLabelBehavior.auto,
                                    prefixIcon: const Icon(Icons.lock_rounded),
                                    suffixIcon: IconButton(
                                      icon: AnimatedSwitcher(
                                        duration: const Duration(milliseconds: 300),
                                        transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
                                        child: Icon(
                                          _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                                          key: ValueKey(_obscurePassword),
                                          color: _isPeeking ? primaryColor : Colors.grey,
                                        ),
                                      ),
                                      onPressed: _togglePasswordVisibility,
                                      tooltip: _obscurePassword ? 'Show Password' : 'Hide Password',
                                    ),
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                                    enabledBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      borderSide: BorderSide(color: Colors.grey.shade300),
                                    ),
                                    focusedBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      borderSide: BorderSide(color: primaryColor, width: 2),
                                    ),
                                    filled: true,
                                    fillColor: Colors.white,
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 32),

                          SizedBox(
                            height: 56,
                            child: FilledButton(
                              onPressed: _isLoading ? null : _submit,
                              style: FilledButton.styleFrom(
                                backgroundColor: primaryColor,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                                elevation: 0,
                              ),
                              child: _isLoading 
                                ? const SizedBox(height: 24, width: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                                : Text(
                                    _isLogin ? 'Sign In' : 'Create Account',
                                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                                  ),
                            ),
                          ),

                          const SizedBox(height: 24),
                          
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                _isLogin ? "New user?" : 'Already a member?',
                                style: TextStyle(color: Colors.grey.shade600),
                              ),
                              TextButton(
                                onPressed: _toggleMode,
                                child: Text(
                                  _isLogin ? 'Sign Up' : 'Log In',
                                  style: TextStyle(fontWeight: FontWeight.bold, color: primaryColor),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    String? Function(String?)? validator,
    TextInputType? keyboardType,
    FocusNode? focusNode,
    void Function(String)? onFieldSubmitted,
    void Function(String)? onChanged,
  }) {
    return TextFormField(
      controller: controller,
      focusNode: focusNode,
      keyboardType: keyboardType,
      validator: validator,
      onFieldSubmitted: onFieldSubmitted,
      onChanged: onChanged,
      style: const TextStyle(fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: Theme.of(context).colorScheme.primary, width: 2),
        ),
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
      ),
    );
  }

  Widget _buildRoleSelector() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: DropdownButtonFormField<String>(
        value: _selectedRole,
        decoration: const InputDecoration(
          prefixIcon: Icon(Icons.work_outline_rounded),
          labelText: 'I am a...',
          border: InputBorder.none,
          contentPadding: EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        ),
        items: const [
          DropdownMenuItem(value: 'contributor', child: Text('Data Contributor')),
          DropdownMenuItem(value: 'agency', child: Text('Agency Buyer')),
        ],
        onChanged: (v) => setState(() => _selectedRole = v!),
      ),
    );
  }

  Widget _buildFeaturePill(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.1),
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: Colors.white.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.blue.shade200, size: 18),
          const SizedBox(width: 8),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// INTERACTIVE AVATAR WIDGET
// ---------------------------------------------------------------------------
class InteractiveAvatar extends StatelessWidget {
  final bool isCheckingPassword;
  final bool isPeeking;
  final int emailTextLength;

  const InteractiveAvatar({
    super.key,
    required this.isCheckingPassword,
    required this.isPeeking,
    required this.emailTextLength,
  });

  @override
  Widget build(BuildContext context) {
    // Basic Circle Avatar
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      width: 100,
      height: 100,
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9), // Slate 100
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 4),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Stack(
        children: [
          // Face Base (Optional)
          
          // EYES
          AnimatedPositioned(
            duration: const Duration(milliseconds: 200),
            // Look down if password, else look center/around
            top: isCheckingPassword ? 45 : 40,
            left: 0, 
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Left Eye
                _buildEye(isLeft: true),
                const SizedBox(width: 16),
                // Right Eye
                _buildEye(isLeft: false),
              ],
            ),
          ),
          
          // MOUTH (Simple smile/neutral)
          Positioned(
            bottom: 25,
            left: 0,
            right: 0,
            child: Center(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: 20,
                height: isCheckingPassword ? 4 : 8,
                decoration: BoxDecoration(
                  color: Colors.grey.shade400,
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
          ),
          
          // HANDS (Covering eyes)
          if (isCheckingPassword) 
             // Left Hand
             AnimatedPositioned(
               duration: const Duration(milliseconds: 300),
               curve: Curves.elasticOut,
               bottom: 0,
               left: isPeeking ? 10 : 25, // Move hand away if peeking, but we only have "peeking one eye" logic usually
               child: Transform.rotate(
                 angle: -0.2,
                 child: _buildHand(isPeeking), 
               ),
             ),
          
          if (isCheckingPassword)
             // Right Hand
             AnimatedPositioned(
               duration: const Duration(milliseconds: 300),
               curve: Curves.elasticOut,
               bottom: 0,
               right: 25,
               child: Transform.rotate(
                 angle: 0.2,
                 child: _buildHand(false), // Right hand always covers
               ),
             ),
        ],
      ),
    );
  }

  Widget _buildHand(bool isPeeking) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      width: 40,
      height: 50,
      // If peeking, move the hand down slightly
      transform: isPeeking ? Matrix4.translationValues(0, 20, 0) : Matrix4.identity(),
      decoration: BoxDecoration(
        color: const Color(0xFFE2E8F0),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        border: Border.all(color: Colors.white, width: 2),
      ),
    );
  }

  Widget _buildEye({required bool isLeft}) {
    // If checking password and NOT peeking, eyes are "closed" (covered effectively, but we can squash them too)
    // If checking password and PEEKING, maybe one eye opens? 
    // For simplicity:
    // Normal: Open circle dot
    // Password: Flat line (closed)

    bool isClosed = isCheckingPassword;
    
    // If peeking, Left eye opens!
    if (isPeeking && isLeft && isCheckingPassword) {
      isClosed = false;
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: isClosed ? 16 : 12,
      height: isClosed ? 4 : 12, // Squashes to line
      decoration: BoxDecoration(
        color: Colors.blueGrey.shade800,
        borderRadius: BorderRadius.circular(100),
      ),
    );
  }
}
