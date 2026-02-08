import React from "react";
import { Twitter, Linkedin, Github } from "lucide-react";

interface FooterProps {
  onOpenAuth?: (mode: "login" | "signup", role?: "user" | "agency") => void;
}

export function Footer({ onOpenAuth }: FooterProps) {
  return (
    <footer className="py-16 px-6 bg-zinc-50 dark:bg-[#0c0a09] border-t border-zinc-100 dark:border-[#1c1917] transition-colors duration-500">
      <div className="container mx-auto max-w-6xl">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <img
                src="/MData.png"
                alt="MData Logo"
                className="w-8 h-8 rounded-lg object-contain"
              />
              <span className="text-xl font-bold text-zinc-900 dark:text-[#e7e5e4]">
                MData
              </span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-[#78716c] mb-6 leading-relaxed">
              Bridging the gap between human creativity and artificial
              intelligence, ethically.
            </p>
            <div className="flex gap-2">
              <SocialIcon
                Icon={Twitter}
                href="https://twitter.com/RahulPujari14507"
              />
              <SocialIcon
                Icon={Linkedin}
                href="https://www.linkedin.com/in/rahul-pujari-b6a467379"
              />
              <SocialIcon Icon={Github} href="https://github.com/Rahul-14507" />
            </div>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-semibold text-zinc-900 dark:text-[#e7e5e4] mb-4">
              Platform
            </h4>
            <ul className="space-y-3 text-sm text-zinc-600 dark:text-[#a8a29e]">
              <li>
                <button
                  onClick={() => onOpenAuth?.("signup", "user")}
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  For Uploaders
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenAuth?.("signup", "agency")}
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  For Agencies
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenAuth?.("signup", "agency")}
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  Marketplace
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenAuth?.("signup", "user")}
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  Pricing
                </button>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-zinc-900 dark:text-[#e7e5e4] mb-4">
              Company
            </h4>
            <ul className="space-y-3 text-sm text-zinc-600 dark:text-[#a8a29e]">
              <li>
                <a
                  href="#"
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  About Us
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  Blog
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  Careers
                </a>
              </li>
              <li>
                <a
                  href="mailto:pujarirahulpandu@gmail.com"
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Legal & Contact */}
          <div>
            <h4 className="font-semibold text-zinc-900 dark:text-[#e7e5e4] mb-4">
              Legal
            </h4>
            <ul className="space-y-3 text-sm text-zinc-600 dark:text-[#a8a29e]">
              <li>
                <a
                  href="/privacy.html"
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="/terms.html"
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="/refund.html"
                  className="hover:text-zinc-900 dark:hover:text-[#e7e5e4] transition-colors"
                >
                  Refund Policy
                </a>
              </li>
              <li>
                <a
                  href="mailto:pujarirahulpandu@gmail.com"
                  className="text-zinc-900 dark:text-[#e7e5e4] hover:underline font-medium"
                >
                  pujarirahulpandu@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="tel:+917032856170"
                  className="text-zinc-900 dark:text-[#e7e5e4] hover:underline font-medium"
                >
                  +91 7032856170
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-zinc-100 dark:border-[#1c1917] flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-zinc-400 dark:text-[#57534e] text-sm font-medium">
            © 2026 MData Inc. All rights reserved.
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-50 dark:bg-[#1c1917] border border-zinc-200 dark:border-[#292524]">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-zinc-600 dark:text-[#78716c] font-semibold">
              Systems Operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function SocialIcon({ Icon, href }: { Icon: any; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-[#1c1917] flex items-center justify-center text-zinc-600 dark:text-[#78716c] hover:bg-zinc-900 dark:hover:bg-[#e7e5e4] hover:text-white dark:hover:text-[#0c0a09] transition-all"
    >
      <Icon className="w-4 h-4" />
    </a>
  );
}
