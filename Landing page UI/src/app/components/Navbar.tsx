import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { Menu, X, ArrowRight, Sun, Moon } from "lucide-react";

interface NavbarProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onOpenAuth?: (mode: "login" | "signup", role?: "user" | "agency") => void;
}

export function Navbar({
  isDarkMode,
  toggleDarkMode,
  onOpenAuth,
}: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 50);
  });

  return (
    <>
      <header
        className={cn(
          "fixed top-6 left-0 right-0 z-50 transition-all duration-500 px-6",
        )}
      >
        <div
          className={cn(
            "max-w-6xl mx-auto rounded-2xl transition-all duration-500 flex items-center justify-between px-6 py-4",
            isScrolled
              ? "bg-white/80 dark:bg-[#1c1917]/80 backdrop-blur-xl shadow-lg shadow-black/5 border border-black/5 dark:border-[#ffffff]/10"
              : "bg-transparent",
          )}
        >
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img
              src="/MData.png"
              alt="MData Logo"
              className="w-8 h-8 rounded-lg object-contain"
            />
            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-[#e7e5e4]">
              MData
            </span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600 dark:text-[#a8a29e]">
            <NavButton onClick={() => onOpenAuth?.("signup", "user")}>
              Uploaders
            </NavButton>
            <NavButton onClick={() => onOpenAuth?.("signup", "agency")}>
              Agencies
            </NavButton>
            <NavButton onClick={() => onOpenAuth?.("signup", "agency")}>
              Marketplace
            </NavButton>
            <NavButton onClick={() => onOpenAuth?.("signup", "user")}>
              Ethics
            </NavButton>
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-[#292524] text-zinc-600 dark:text-[#a8a29e] transition-colors"
            >
              {isDarkMode ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => onOpenAuth?.("login")}
              className="text-sm font-medium text-zinc-900 dark:text-[#e7e5e4] hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
            >
              Log in
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("user");
                onOpenAuth?.("signup");
              }}
              className="group relative px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-[#e7e5e4] text-white dark:text-[#0c0a09] text-sm font-semibold overflow-hidden transition-all hover:bg-zinc-800 dark:hover:bg-white"
            >
              <span className="relative z-10 flex items-center gap-2">
                Get Started <ArrowRight className="w-4 h-4" />
              </span>
            </button>
          </div>

          {/* Mobile Toggle */}
          <div className="flex items-center gap-4 md:hidden">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-[#292524] text-zinc-600 dark:text-[#a8a29e] transition-colors"
            >
              {isDarkMode ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
            <button
              className="text-zinc-900 dark:text-[#e7e5e4]"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-white dark:bg-[#0c0a09] pt-24 px-6 md:hidden"
          >
            <div className="flex flex-col gap-6 text-xl font-medium text-zinc-900 dark:text-[#e7e5e4]">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth?.("signup", "user");
                }}
                className="border-b border-zinc-100 dark:border-[#292524] pb-4 text-left"
              >
                Uploaders
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth?.("signup", "agency");
                }}
                className="border-b border-zinc-100 dark:border-[#292524] pb-4 text-left"
              >
                Agencies
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth?.("signup", "agency");
                }}
                className="border-b border-zinc-100 dark:border-[#292524] pb-4 text-left"
              >
                Marketplace
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth?.("signup", "user");
                }}
                className="border-b border-zinc-100 dark:border-[#292524] pb-4 text-left"
              >
                Ethics
              </button>
              <div className="pt-4 flex flex-col gap-4">
                <button
                  onClick={() => onOpenAuth?.("login")}
                  className="w-full py-4 rounded-xl bg-zinc-100 dark:bg-[#1c1917] font-semibold"
                >
                  Log in
                </button>
                <button
                  onClick={() => onOpenAuth?.("signup")}
                  className="w-full py-4 rounded-xl bg-zinc-900 dark:bg-[#e7e5e4] text-white dark:text-[#0c0a09] font-semibold"
                >
                  Get Started
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function NavButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="relative group overflow-hidden">
      <span className="relative z-10">{children}</span>
      <span className="absolute bottom-0 left-0 w-full h-[1px] bg-orange-500 -translate-x-full group-hover:translate-x-0 transition-transform duration-300" />
    </button>
  );
}
