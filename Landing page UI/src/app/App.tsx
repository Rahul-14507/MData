import React, { useState, useEffect } from "react";
import { Navbar } from "@/app/components/Navbar";
import { Hero } from "@/app/components/Hero";
import { Logos } from "@/app/components/Logos";
import { SplitFeatures } from "@/app/components/FeatureCards";
import { Workflow } from "@/app/components/Workflow";
import { CTA } from "@/app/components/CTA";
import { Footer } from "@/app/components/Footer";
import { AuthModal } from "@/app/components/AuthModal";

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authRole, setAuthRole] = useState<"user" | "agency">("user");

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const openAuth = (
    mode: "login" | "signup",
    role: "user" | "agency" = "user",
  ) => {
    setAuthMode(mode);
    setAuthRole(role);
    setIsAuthOpen(true);
  };

  // Dark mode: bg-[#0c0a09] is Stone-950 (warm black), Text is Stone-200
  return (
    <div
      className={`min-h-screen font-sans selection:bg-orange-200 selection:text-orange-900 transition-colors duration-500 ${isDarkMode ? "bg-[#0c0a09] text-[#e7e5e4]" : "bg-[#FAF9F6] text-zinc-900"}`}
    >
      <Navbar
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        onOpenAuth={openAuth}
      />
      <main>
        <Hero onOpenAuth={openAuth} />
        <Logos />
        <SplitFeatures onOpenAuth={openAuth} />
        <Workflow />
        <CTA onOpenAuth={openAuth} />
      </main>
      <Footer onOpenAuth={openAuth} />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        initialMode={authMode}
        initialRole={authRole}
      />
    </div>
  );
}
