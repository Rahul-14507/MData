import React from "react";
import { ArrowRight } from "lucide-react";

interface CTAProps {
  onOpenAuth?: (mode: "login" | "signup", role?: "user" | "agency") => void;
}

export function CTA({ onOpenAuth }: CTAProps) {
  return (
    <section className="py-12 px-6 bg-transparent transition-colors duration-500">
      <div className="container mx-auto max-w-6xl">
        <div className="bg-zinc-900 dark:bg-[#1c1917] rounded-[2.5rem] overflow-hidden text-center py-24 px-6 relative border border-transparent dark:border-[#292524] transition-colors shadow-2xl shadow-black/20">
          {/* Background Grain */}
          <div className="absolute inset-0 opacity-40 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay pointer-events-none"></div>

          {/* Glowing Orbs */}
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-orange-500/20 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-5xl md:text-7xl font-bold text-white dark:text-[#e7e5e4] mb-8 font-serif italic tracking-tight">
              Start today.
            </h2>
            <p className="text-xl text-zinc-400 dark:text-[#a8a29e] mb-12">
              Join the ecosystem that prioritizes human ownership in the age of
              artificial intelligence.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => onOpenAuth?.("signup")}
                className="px-8 py-4 bg-white text-zinc-900 text-lg font-bold rounded-xl hover:bg-zinc-200 transition-all shadow-xl shadow-white/10 flex items-center justify-center gap-2 group"
              >
                Sign Up Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => (window.location.href = "mailto:sales@mdata.ai")}
                className="px-8 py-4 bg-transparent border border-zinc-700 dark:border-[#57534e] text-white dark:text-[#e7e5e4] text-lg font-semibold rounded-xl hover:bg-zinc-800 dark:hover:bg-[#292524] transition-colors"
              >
                Book a Demo
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
