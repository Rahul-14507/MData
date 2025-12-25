import 'package:flutter/foundation.dart';

class ApiConfig {
  // Host Machine IP for Physical Devices
  static const String _hostIp = '10.60.40.83'; 
  static const String _port = '7071';

  static String get baseUrl {
    if (kIsWeb) {
      return 'http://localhost:$_port';
    } else if (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS) {
      // Use Host IP for both Android (Physical) and iOS (Physical)
      // Note: Android Emulator use 10.0.2.2, but user has physical device.
      // Ideally, we'd checking for emulator vs physical, but for this specific user setup, 
      // the LAN IP is the safest bet for both if on the same network.
      return 'http://$_hostIp:$_port';
    } else {
      // MacOS, Windows, Linux
      return 'http://localhost:$_port';
    }
  }
}
