import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:data_nexus/features/auth/auth_provider.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  bool _isLogin = true;
  final _formKey = GlobalKey<FormState>();
  
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  String _selectedRole = 'contributor';

  bool _isLoading = false;

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

      setState(() => _isLoading = false);
      
      if (success) {
        // Router redirect logic will handle navigation, but as fail-safe:
        if (mounted) context.go('/'); 
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Authentication Failed')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          // Left Side: Branding (Hidden on mobile)
          if (MediaQuery.of(context).size.width > 800)
            Expanded(
              child: Container(
                color: Theme.of(context).colorScheme.primary,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.dataset, size: 100, color: Colors.white),
                    const SizedBox(height: 20),
                    Text('MData', style: Theme.of(context).textTheme.displayLarge?.copyWith(color: Colors.white)),
                    const Text('The Future of Data Marketplaces', style: TextStyle(color: Colors.white70)),
                  ],
                ),
              ),
            ),
          
          // Right Side: Form
          Expanded(
            child: Center(
              child: Container(
                constraints: const BoxConstraints(maxWidth: 400),
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        _isLogin ? 'Welcome Back' : 'Create Account',
                        style: Theme.of(context).textTheme.headlineMedium,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 32),
                      
                      if (!_isLogin) ...[
                         TextFormField(
                          controller: _nameCtrl,
                          decoration: const InputDecoration(labelText: 'Full Name', border: OutlineInputBorder()),
                          validator: (v) => v!.isEmpty ? 'Required' : null,
                        ),
                        const SizedBox(height: 16),
                        DropdownButtonFormField<String>(
                          value: _selectedRole,
                          decoration: const InputDecoration(labelText: 'I am a...', border: OutlineInputBorder()),
                          items: const [
                            DropdownMenuItem(value: 'contributor', child: Text('Data Contributor')),
                            DropdownMenuItem(value: 'agency', child: Text('Agency Buyer')),
                          ], 
                          onChanged: (v) => setState(() => _selectedRole = v!),
                        ),
                        const SizedBox(height: 16),
                      ],

                      TextFormField(
                        controller: _emailCtrl,
                        decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                        validator: (v) => v!.contains('@') ? null : 'Invalid email',
                      ),
                      const SizedBox(height: 16),
                      
                      TextFormField(
                        controller: _passCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
                        validator: (v) => v!.length < 6 ? 'Min 6 chars' : null,
                      ),
                      const SizedBox(height: 24),

                      SizedBox(
                        height: 48,
                        child: FilledButton(
                          onPressed: _isLoading ? null : _submit,
                          child: _isLoading ? const CircularProgressIndicator() : Text(_isLogin ? 'Login' : 'Sign Up'),
                        ),
                      ),
                      
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: () => setState(() => _isLogin = !_isLogin),
                        child: Text(_isLogin ? 'Need an account? Sign Up' : 'Have an account? Login'),
                      )
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
