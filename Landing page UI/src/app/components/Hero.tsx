import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Search } from "lucide-react";

interface HeroProps {
  onOpenAuth?: (mode: "login" | "signup", role?: "user" | "agency") => void;
}

export function Hero({ onOpenAuth }: HeroProps) {
  return (
    <section className="relative pt-32 pb-20 px-6 overflow-hidden">
      {/* Background Texture */}
      <div className="absolute inset-0 -z-10 bg-[#FAF9F6] dark:bg-[#0c0a09] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] transition-colors duration-500"></div>

      {/* Organic Shape Blob - Adjusted for warm dark mode */}
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          rotate: [0, 30, 0],
          x: [0, 50, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          repeatType: "reverse",
        }}
        // Dark mode: using opacity-20 and blend-screen with warm colors to look like faint nebula/smoke
        className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-gradient-to-br from-orange-200/40 to-yellow-200/40 dark:from-[#ea580c]/10 dark:to-[#ca8a04]/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen opacity-70 dark:opacity-100 pointer-events-none"
      />
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, -45, 0],
          x: [0, -30, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          repeatType: "reverse",
          delay: 2,
        }}
        className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-gradient-to-tr from-green-200/40 to-teal-200/40 dark:from-[#15803d]/10 dark:to-[#0d9488]/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen opacity-70 dark:opacity-100 pointer-events-none"
      />

      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-col lg:flex-row gap-16 items-center">
          {/* Left: Typography */}
          <div className="flex-1 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-50 dark:bg-[#292524] text-orange-700 dark:text-orange-200 text-sm font-semibold mb-8 border border-orange-100 dark:border-orange-500/20"
            >
              <span className="w-2 h-2 rounded-full bg-orange-500 dark:bg-orange-400" />
              Ethical Data Marketplace
            </motion.div>

            <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-zinc-900 dark:text-[#e7e5e4] mb-8 leading-[0.9]">
              Fueling AI <br />
              <span className="relative inline-block">
                <span className="relative z-10 font-serif italic font-normal text-zinc-800 dark:text-[#d6d3d1]">
                  Ethically.
                </span>
                <span className="absolute bottom-2 left-0 w-full h-4 bg-yellow-200/80 dark:bg-[#b45309]/40 -z-0 -rotate-1 transform origin-left" />
              </span>
            </h1>

            <p className="text-xl text-zinc-600 dark:text-[#a8a29e] mb-10 max-w-lg mx-auto lg:mx-0 leading-relaxed">
              The bridge between human content creators and artificial
              intelligence. Monetize your data securely, or access compliant
              datasets.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
              <button
                onClick={() => onOpenAuth?.("signup", "user")}
                className="px-8 py-4 bg-zinc-900 dark:bg-[#e7e5e4] text-white dark:text-[#0c0a09] rounded-xl font-semibold flex items-center gap-2 hover:bg-zinc-800 dark:hover:bg-white transition-all hover:gap-4"
              >
                Start Uploading <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onOpenAuth?.("signup", "agency")}
                className="px-8 py-4 bg-white dark:bg-[#1c1917] text-zinc-900 dark:text-[#e7e5e4] border border-zinc-200 dark:border-[#292524] rounded-xl font-semibold flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-[#292524] transition-all"
              >
                <Search className="w-4 h-4 text-zinc-400 dark:text-[#78716c]" />{" "}
                Browse Datasets
              </button>
            </div>

            <div className="mt-12 flex items-center justify-center lg:justify-start gap-8 text-sm font-medium text-zinc-500 dark:text-[#78716c]">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-[#1c1917] border dark:border-[#15803d]/30 flex items-center justify-center">
                  <Check className="w-3 h-3 text-green-600 dark:text-[#16a34a]" />
                </div>
                GDPR Compliant
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-[#1c1917] border dark:border-[#15803d]/30 flex items-center justify-center">
                  <Check className="w-3 h-3 text-green-600 dark:text-[#16a34a]" />
                </div>
                Human Verified
              </div>
            </div>
          </div>

          {/* Right: Visual */}
          <div className="flex-1 relative w-full max-w-md lg:max-w-full">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="aspect-square relative"
            >
              {/* Abstract Cards Composition */}
              {/* Dark Mode Card: Dark charcoal background, subtle border, no heavy shadows */}
              <div className="absolute inset-0 bg-white dark:bg-[#1c1917] rounded-3xl shadow-2xl dark:shadow-none border border-zinc-100 dark:border-[#292524] p-6 overflow-hidden rotate-2 lg:rotate-2 hover:rotate-0 transition-all duration-700 ease-out">
                {/* Header of Card */}
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <div className="text-xs text-zinc-400 dark:text-[#78716c] font-mono uppercase">
                      Total Earnings
                    </div>
                    <div className="text-3xl font-bold text-zinc-900 dark:text-[#e7e5e4]">
                      ₹12,450.00
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-[#292524] flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-zinc-900 dark:border-[#e7e5e4] rounded-full" />
                  </div>
                </div>

                {/* Chart Simulation */}
                <div className="flex items-end gap-3 h-32 mb-8 px-2">
                  {[40, 70, 45, 90, 60, 80, 50, 95].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.8, delay: 0.5 + i * 0.1 }}
                      className={`flex-1 rounded-t-sm ${i === 3 || i === 7 ? "bg-zinc-900 dark:bg-[#e7e5e4]" : "bg-zinc-200 dark:bg-[#44403c]"}`}
                    />
                  ))}
                </div>

                {/* List Items */}
                <div className="space-y-3">
                  <div className="p-3 bg-zinc-50 dark:bg-[#0c0a09]/50 rounded-xl flex items-center justify-between border border-transparent dark:border-[#292524]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-100 dark:bg-[#431407] rounded-lg flex items-center justify-center text-orange-600 dark:text-orange-200 font-bold text-xs">
                        A
                      </div>
                      <div className="text-sm font-medium text-zinc-700 dark:text-[#d6d3d1]">
                        Audio Dataset_v2
                      </div>
                    </div>
                    <span className="text-xs font-bold text-green-600 dark:text-[#4ade80]">
                      +₹450
                    </span>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-[#0c0a09]/50 rounded-xl flex items-center justify-between border border-transparent dark:border-[#292524]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 dark:bg-[#172554] rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-200 font-bold text-xs">
                        I
                      </div>
                      <div className="text-sm font-medium text-zinc-700 dark:text-[#d6d3d1]">
                        Image Collection
                      </div>
                    </div>
                    <span className="text-xs font-bold text-green-600 dark:text-[#4ade80]">
                      +₹820
                    </span>
                  </div>
                </div>
              </div>

              {/* Floating Badge */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="absolute -bottom-6 -left-6 bg-zinc-900 dark:bg-[#e7e5e4] text-white dark:text-[#0c0a09] p-4 rounded-2xl shadow-xl max-w-[200px]"
              >
                <div className="text-xs text-zinc-400 dark:text-[#57534e] mb-1">
                  Agency Request
                </div>
                <div className="font-semibold text-sm mb-2">
                  Looking for 500h of clear speech data.
                </div>
                <div className="flex -space-x-2">
                  <div className="w-6 h-6 rounded-full bg-zinc-700 dark:bg-[#d6d3d1] border border-zinc-900 dark:border-[#e7e5e4]" />
                  <div className="w-6 h-6 rounded-full bg-zinc-600 dark:bg-[#a8a29e] border border-zinc-900 dark:border-[#e7e5e4]" />
                  <div className="w-6 h-6 rounded-full bg-zinc-500 dark:bg-[#78716c] border border-zinc-900 dark:border-[#e7e5e4] flex items-center justify-center text-[8px] dark:text-white">
                    +3
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
