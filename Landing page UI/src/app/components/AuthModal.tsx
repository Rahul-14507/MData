import React, { useState, useEffect } from "react";
import {
  X,
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "signup";
  initialRole?: "user" | "agency";
}

export function AuthModal({
  isOpen,
  onClose,
  initialMode = "login",
  initialRole = "user",
}: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [role, setRole] = useState<"user" | "agency">(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setRole(initialRole);
  }, [initialRole]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setOtpStep(false);
      setOtp("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setName("");
    }
  }, [isOpen]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === "login") {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, role }),
        });
        const data = await res.json();

        if (data.success) {
          localStorage.setItem("user", JSON.stringify(data.user));
          window.location.href = data.redirect;
        } else {
          setError(data.error || "Login failed");
        }
      } else if (mode === "signup" && !otpStep) {
        if (!name) throw new Error("Name is required");
        if (password !== confirmPassword)
          throw new Error("Passwords do not match");

        // Request OTP
        const res = await fetch("/api/otp/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            type: "numeric",
            organization: "MData",
            subject: "Verify Your Email - MData",
          }),
        });

        if (res.ok) {
          setOtpStep(true);
          setResendTimer(180);
        } else {
          const data = await res.json();
          throw new Error(data.message || "Failed to send OTP");
        }
      } else if (mode === "signup" && otpStep) {
        // Verify OTP
        const verifyRes = await fetch("/api/otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp }),
        });

        if (!verifyRes.ok) {
          const data = await verifyRes.json();
          throw new Error(data.message || "Invalid OTP");
        }

        // Create Account
        const signupRes = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, role }),
        });

        const data = await signupRes.json();
        if (data.success) {
          localStorage.setItem("user", JSON.stringify(data.user));
          window.location.href = data.redirect;
        } else {
          throw new Error(data.error || "Signup failed");
        }
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const socialLogin = (provider: string) => {
    window.location.href = `/auth/${provider}?role=${role}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl bg-[#0c0a09] border border-[#292524] rounded-2xl shadow-2xl overflow-hidden flex flex-col lg:flex-row max-h-[90vh]"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white transition-colors z-50 rounded-full hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Left Panel - Branding */}
          <div className="hidden lg:flex w-[45%] relative overflow-hidden bg-gradient-to-br from-orange-950/30 via-[#0c0a09] to-stone-950/50 p-10 flex-col justify-between">
            <div className="absolute top-0 left-0 w-full h-full">
              <div className="absolute -top-20 -left-20 w-64 h-64 bg-orange-600/10 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-green-600/10 rounded-full blur-3xl"></div>
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <img
                  src="/MData.png"
                  alt="MData Logo"
                  className="w-10 h-10 rounded-xl object-contain"
                />
                <span className="text-xl font-bold tracking-tight text-[#e7e5e4]">
                  MData
                </span>
              </div>

              <h2 className="text-3xl font-bold text-[#e7e5e4] mb-4 leading-tight">
                Fuel AI with <br />{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-200">
                  Ethical Data
                </span>
              </h2>
              <p className="text-[#a8a29e] text-sm leading-relaxed max-w-xs">
                Join thousands of contributors earning from their data, or
                access verified AI training datasets.
              </p>
            </div>

            <div className="relative z-10 space-y-4">
              <FeatureItem
                icon={CheckCircle}
                text="AI-powered quality scoring"
                color="text-orange-500"
              />
              <FeatureItem
                icon={CheckCircle}
                text="Instant payouts to your wallet"
                color="text-green-500"
              />
              <FeatureItem
                icon={CheckCircle}
                text="Bank-grade security"
                color="text-blue-500"
              />
            </div>
          </div>

          {/* Right Panel - Form */}
          <div className="flex-1 p-6 sm:p-10 overflow-y-auto bg-[#0c0a09]">
            <div className="lg:hidden flex items-center gap-2 mb-6">
              <img
                src="/MData.png"
                alt="MData Logo"
                className="w-8 h-8 rounded-lg object-contain"
              />
              <span className="text-lg font-bold text-[#e7e5e4]">MData</span>
            </div>

            <div className="mb-6">
              <h3 className="text-2xl font-bold text-[#e7e5e4] mb-1">
                {mode === "login" ? "Welcome Back" : "Join MData"}
              </h3>
              <p className="text-[#a8a29e] text-sm">
                {mode === "login"
                  ? "Sign in to continue to your account"
                  : "Start your journey with ethical data"}
              </p>
            </div>

            {/* Role Switcher */}
            <div className="flex p-1 bg-[#1c1917] rounded-xl border border-[#292524] mb-6">
              <button
                onClick={() => setRole("user")}
                className={cn(
                  "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                  role === "user"
                    ? "bg-orange-600 text-white shadow-lg"
                    : "text-[#a8a29e] hover:text-[#e7e5e4]",
                )}
              >
                User
              </button>
              <button
                onClick={() => setRole("agency")}
                className={cn(
                  "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                  role === "agency"
                    ? "bg-green-600 text-white shadow-lg"
                    : "text-[#a8a29e] hover:text-[#e7e5e4]",
                )}
              >
                Agency
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && !otpStep && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#a8a29e] uppercase tracking-wider">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716c]" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full h-11 bg-[#1c1917] border border-[#292524] rounded-lg pl-10 pr-4 text-[#e7e5e4] placeholder-[#57534e] focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Email (Disabled in OTP step) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#a8a29e] uppercase tracking-wider">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716c]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={otpStep}
                    placeholder="name@company.com"
                    className="w-full h-11 bg-[#1c1917] border border-[#292524] rounded-lg pl-10 pr-4 text-[#e7e5e4] placeholder-[#57534e] focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all text-sm disabled:opacity-50"
                  />
                </div>
              </div>

              {!otpStep && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#a8a29e] uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716c]" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-11 bg-[#1c1917] border border-[#292524] rounded-lg pl-10 pr-10 text-[#e7e5e4] placeholder-[#57534e] focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78716c] hover:text-[#e7e5e4]"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {mode === "signup" && !otpStep && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#a8a29e] uppercase tracking-wider">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716c]" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-11 bg-[#1c1917] border border-[#292524] rounded-lg pl-10 pr-4 text-[#e7e5e4] placeholder-[#57534e] focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all text-sm"
                    />
                  </div>
                </div>
              )}

              {otpStep && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4">
                  <div className="text-center p-4 bg-[#1c1917] rounded-lg border border-[#292524]">
                    <p className="text-xs text-[#a8a29e] mb-1">
                      Enter code sent to
                    </p>
                    <p className="text-[#e7e5e4] font-medium text-sm">
                      {email}
                    </p>
                  </div>
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="000000"
                    className="w-full h-12 bg-[#1c1917] border border-[#292524] rounded-lg text-center text-xl tracking-[0.5em] text-[#e7e5e4] placeholder-[#57534e] focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all font-mono"
                  />
                  <div className="flex justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => setOtpStep(false)}
                      className="text-[#78716c] hover:text-[#e7e5e4]"
                    >
                      Change Email
                    </button>
                    <button
                      type="button"
                      disabled={resendTimer > 0}
                      className="text-orange-500 hover:text-orange-400 disabled:opacity-50"
                    >
                      Resend in {Math.floor(resendTimer / 60)}:
                      {(resendTimer % 60).toString().padStart(2, "0")}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-lg flex items-start gap-2 text-red-200 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  "w-full h-11 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100",
                  role === "user"
                    ? "bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 shadow-orange-900/20"
                    : "bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-green-900/20",
                )}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {mode === "login"
                      ? "Sign In"
                      : otpStep
                        ? "Verify & Create Account"
                        : "Get Started"}
                    {!isLoading && <ArrowRight className="w-4 h-4" />}
                  </>
                )}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#292524]"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#0c0a09] px-2 text-[#57534e]">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => socialLogin("google")}
                className="flex items-center justify-center gap-2 h-10 bg-[#fafaf9] text-[#0c0a09] rounded-lg text-sm font-medium hover:bg-white transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </button>
              <button
                onClick={() => socialLogin("github")}
                className="flex items-center justify-center gap-2 h-10 bg-[#1c1917] border border-[#292524] text-[#e7e5e4] rounded-lg text-sm font-medium hover:bg-[#292524] transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs text-[#57534e]">
                {mode === "login"
                  ? "Don't have an account?"
                  : "Already have an account?"}
                <button
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                  className="ml-1 text-orange-500 font-bold hover:underline"
                >
                  {mode === "login" ? "Create account" : "Sign In"}
                </button>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function FeatureItem({
  icon: Icon,
  text,
  color,
}: {
  icon: any;
  text: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={cn("w-5 h-5", color)} />
      <span className="text-sm font-medium text-[#d6d3d1]">{text}</span>
    </div>
  );
}
