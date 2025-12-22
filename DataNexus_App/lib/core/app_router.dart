import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:data_nexus/features/dashboard/dashboard_screen.dart';
import 'package:data_nexus/features/auth/auth_screen.dart';
import 'package:data_nexus/features/auth/auth_provider.dart';
import 'package:data_nexus/features/market/agency_market_screen.dart';

// Simple navigation provider
final routerProvider = Provider<GoRouter>((ref) {
  final user = ref.watch(authProvider);
  
  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final isLoggedIn = user != null;
      final isAuthRoute = state.matchedLocation == '/auth';
      
      if (!isLoggedIn && !isAuthRoute) return '/auth';
      
      if (isLoggedIn) {
        if (isAuthRoute) {
          return user.role == 'agency' ? '/agency' : '/';
        }
        // Redirect root to agency if user is agency (optional, but good UX)
        if (state.matchedLocation == '/' && user.role == 'agency') {
          return '/agency';
        }
      }
      
      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const DashboardScreen(),
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
