import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:data_nexus/features/dashboard/dashboard_screen.dart';
import 'package:data_nexus/features/auth/auth_screen.dart';
import 'package:data_nexus/features/auth/auth_provider.dart';
import 'package:data_nexus/features/landing/landing_screen.dart';
import 'package:data_nexus/features/market/agency_market_screen.dart';

// Simple navigation provider
final routerProvider = Provider<GoRouter>((ref) {
  final user = ref.watch(authProvider);
  
  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final isLoggedIn = user != null;
      final isAuthRoute = state.matchedLocation == '/auth';
      final isAgencyRoute = state.matchedLocation == '/agency';
      
      // Web: Allow Landing Page ('/') without login
      // Mobile: Force Login
      if (!isLoggedIn && !isAuthRoute) {
         if (kIsWeb && state.matchedLocation == '/') return null; // Allow Landing
         return '/auth';
      }
      
      if (isLoggedIn) {
        if (state.matchedLocation == '/' && user.role == 'agency') {
          return '/agency';
        }
        if (isAuthRoute) {
          return user.role == 'agency' ? '/agency' : '/';
        }
      }
      
      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) {
           final user = ref.read(authProvider);
           if (kIsWeb && user == null) return const LandingScreen();
           return const DashboardScreen();
        },
        routes: [
           GoRoute(
            path: 'agency',
            builder: (context, state) => const AgencyMarketScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/auth',
        builder: (context, state) => const AuthScreen(),
      ),
    ],
  );
});
