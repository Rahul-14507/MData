import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class User {
  final String id;
  final String name;
  final String email;
  final String role;
  final double balance;

  User({required this.id, required this.name, required this.email, required this.role, required this.balance});

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      name: json['name'],
      email: json['email'],
      role: json['role'] ?? 'contributor',
      balance: (json['balance'] ?? 0.0).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'role': role,
    'balance': balance,
  };
}

class AuthNotifier extends StateNotifier<User?> {
  AuthNotifier() : super(null) {
    _loadUser();
  }

  // Replace with actual URL if different
  static const String _authUrl = 'http://localhost:7071/api/auth';

  Future<void> _loadUser() async {
    final prefs = await SharedPreferences.getInstance();
    final userStr = prefs.getString('user_session');
    if (userStr != null) {
      try {
        state = User.fromJson(json.decode(userStr));
      } catch (e) {
        prefs.remove('user_session'); 
      }
    }
  }

  Future<void> _saveUser(User user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_session', json.encode(user.toJson()));
  }

  Future<bool> login(String email, String password) async {
    try {
      final response = await http.post(
        Uri.parse(_authUrl),
        body: json.encode({'action': 'login', 'email': email, 'password': password}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final user = User.fromJson(data['user']);
        state = user;
        await _saveUser(user);
        return true;
      }
    } catch (e) {
      print('Login error: $e');
    }
    return false;
  }

  Future<bool> signup(String name, String email, String password, String role) async {
    try {
      final response = await http.post(
        Uri.parse(_authUrl),
        body: json.encode({
          'action': 'signup', 
          'name': name, 
          'email': email, 
          'password': password,
          'role': role
        }),
      );

      if (response.statusCode == 201) {
        final data = json.decode(response.body);
        final user = User.fromJson(data['user']);
        state = user;
        await _saveUser(user);
        return true;
      }
    } catch (e) {
       print('Signup error: $e');
    }
    return false;
  }

  Future<void> logout() async {
    state = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear(); // Clear all data to prevent leaks associated with the back button
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, User?>((ref) => AuthNotifier());
