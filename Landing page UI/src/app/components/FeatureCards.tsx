import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  ShieldCheck,
  DollarSign,
  Search,
  Scale,
  FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SplitFeaturesProps {
  onOpenAuth?: (mode: "login" | "signup", role?: "user" | "agency") => void;
}

const features = {
  uploaders: {
    title: "For Uploaders",
    subtitle: "Monetize Your Digital Footprint",
    color: "bg-orange-500",
    items: [
      {
        icon: UploadCloud,
        title: "Bulk Upload",
        desc: "Drag & drop terabytes of data. We handle the formatting.",
      },
      {
        icon: ShieldCheck,
        title: "Privacy Engine",
        desc: "Automatic PII stripping before any human sees it.",
      },
      {
        icon: DollarSign,
        title: "Passive Income",
        desc: "Earn royalties every time your data trains a model.",
      },
    ],
  },
  agencies: {
    title: "For Agencies",
    subtitle: "Train with Confidence",
    color: "bg-zinc-900",
    items: [
      {
        icon: Search,
        title: "Deep Search",
        desc: "Filter by dialect, resolution, lighting, and demographic.",
      },
      {
        icon: Scale,
        title: "Legal Safety",
        desc: "Full commercial rights and indemnification included.",
      },
      {
        icon: FileCheck,
        title: "Quality QA",
        desc: "Every dataset is human-verified for consistency.",
      },
    ],
  },
};

export function SplitFeatures({ onOpenAuth }: SplitFeaturesProps) {
  const [activeTab, setActiveTab] = useState<"uploaders" | "agencies">(
    "uploaders",
  );

  return (
    <section className="py-24 px-6 bg-[#FAF9F6] dark:bg-[#0c0a09] transition-colors duration-500">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-[#e7e5e4] mb-6 font-serif">
            Two sides of the same coin.
          </h2>
          <p className="text-lg text-zinc-600 dark:text-[#a8a29e]">
            We've built a unified ecosystem that rewards creators and empowers
            developers.
          </p>
        </div>

        {/* Custom Tab Switcher */}
        <div className="flex justify-center mb-12">
          <div className="bg-zinc-200 dark:bg-[#1c1917] p-1 rounded-full inline-flex relative transition-colors">
            {/* Sliding Background */}
            <motion.div
              layoutId="activeTabBg"
              className={cn(
                "absolute top-1 bottom-1 rounded-full shadow-sm",
                activeTab === "uploaders"
                  ? "left-1 w-[140px] bg-white dark:bg-[#292524]"
                  : "left-[144px] w-[140px] bg-white dark:bg-[#292524]",
              )}
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
            <button
              onClick={() => setActiveTab("uploaders")}
              className={cn(
                "relative z-10 w-[140px] py-3 rounded-full text-sm font-semibold transition-colors",
                activeTab === "uploaders"
                  ? "text-zinc-900 dark:text-[#e7e5e4]"
                  : "text-zinc-500 dark:text-[#78716c] hover:text-zinc-700 dark:hover:text-[#a8a29e]",
              )}
            >
              Uploaders
            </button>
            <button
              onClick={() => setActiveTab("agencies")}
              className={cn(
                "relative z-10 w-[140px] py-3 rounded-full text-sm font-semibold transition-colors",
                activeTab === "agencies"
                  ? "text-zinc-900 dark:text-[#e7e5e4]"
                  : "text-zinc-500 dark:text-[#78716c] hover:text-zinc-700 dark:hover:text-[#a8a29e]",
              )}
            >
              Agencies
            </button>
          </div>
        </div>

        <div className="relative min-h-[500px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="grid md:grid-cols-2 gap-8 md:gap-12"
            >
              {/* Left: Content Cards */}
              <div className="space-y-4">
                {features[activeTab].items.map((item, i) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white dark:bg-[#1c1917] p-6 rounded-2xl border border-zinc-100 dark:border-[#292524] shadow-sm hover:shadow-md transition-all group cursor-default"
                  >
                    <div className="flex gap-4">
                      <div
                        className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                          activeTab === "uploaders"
                            ? "bg-orange-100 dark:bg-[#431407] text-orange-600 dark:text-orange-200 group-hover:bg-orange-600 group-hover:text-white"
                            : "bg-zinc-100 dark:bg-[#292524] text-zinc-900 dark:text-[#e7e5e4] group-hover:bg-zinc-900 dark:group-hover:bg-[#e7e5e4] group-hover:text-white dark:group-hover:text-[#0c0a09]",
                        )}
                      >
                        <item.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-zinc-900 dark:text-[#e7e5e4] mb-1">
                          {item.title}
                        </h3>
                        <p className="text-zinc-500 dark:text-[#a8a29e] leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Right: Big Visual Card */}
              <div
                className={cn(
                  "rounded-3xl p-8 md:p-12 flex flex-col justify-between text-white relative overflow-hidden transition-colors",
                  activeTab === "uploaders"
                    ? "bg-orange-600 dark:bg-[#ea580c]"
                    : "bg-zinc-900 dark:bg-[#292524]",
                )}
              >
                {/* Abstract Circles */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

                <div className="relative z-10">
                  <div className="inline-block px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider mb-6">
                    {activeTab}
                  </div>
                  <h3 className="text-4xl font-serif font-bold mb-4">
                    {features[activeTab].subtitle}
                  </h3>
                  <p className="text-white/80 max-w-sm">
                    Join thousands of users who are already shaping the future
                    of AI models through our secure platform.
                  </p>
                </div>

                <div className="relative z-10 mt-12">
                  <button
                    onClick={() =>
                      onOpenAuth?.(
                        "signup",
                        activeTab === "uploaders" ? "user" : "agency",
                      )
                    }
                    className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-100 transition-colors"
                  >
                    {activeTab === "uploaders"
                      ? "Start Earning Now"
                      : "Request Data Access"}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
