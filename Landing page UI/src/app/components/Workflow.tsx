import React from "react";
import { Upload, FileCheck, Coins, ArrowRight } from "lucide-react";

export function Workflow() {
  return (
    <section className="py-24 bg-white dark:bg-[#0c0a09] border-y border-zinc-100 dark:border-[#1c1917] transition-colors duration-500">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-6">
            <h2 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-[#e7e5e4] font-serif leading-tight">
                From raw file <br />
                <span className="text-zinc-400 dark:text-[#57534e]">to revenue stream.</span>
            </h2>
            <div className="flex items-center gap-2 text-zinc-500 dark:text-[#78716c] font-medium">
                Scroll to explore <ArrowRight className="w-4 h-4" />
            </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting Line (Desktop) */}
            <div className="hidden md:block absolute top-[28px] left-[10%] right-[10%] h-[2px] bg-zinc-100 dark:bg-[#1c1917] z-0" />

            {/* Step 1 */}
            <div className="relative z-10 group">
                <div className="w-14 h-14 rounded-full bg-white dark:bg-[#1c1917] border-2 border-zinc-100 dark:border-[#292524] flex items-center justify-center mb-6 group-hover:border-zinc-900 dark:group-hover:border-[#e7e5e4] transition-colors shadow-lg shadow-black/5 dark:shadow-none">
                    <span className="font-mono font-bold text-lg text-zinc-400 dark:text-[#57534e] group-hover:text-zinc-900 dark:group-hover:text-[#e7e5e4]">01</span>
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-[#e7e5e4] mb-3">Upload & Anonymize</h3>
                <p className="text-zinc-500 dark:text-[#a8a29e] leading-relaxed mb-6">
                    Simply drag and drop your raw video, audio, or image files. Our on-device engine strips metadata instantly.
                </p>
                <div className="p-4 bg-zinc-50 dark:bg-[#1c1917] rounded-xl border border-zinc-100 dark:border-[#292524]">
                    <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-[#a8a29e]">
                        <Upload className="w-4 h-4" />
                        <span>Supports .mp4, .wav, .png</span>
                    </div>
                </div>
            </div>

            {/* Step 2 */}
            <div className="relative z-10 group">
                <div className="w-14 h-14 rounded-full bg-white dark:bg-[#1c1917] border-2 border-zinc-100 dark:border-[#292524] flex items-center justify-center mb-6 group-hover:border-orange-500 transition-colors shadow-lg shadow-black/5 dark:shadow-none">
                    <span className="font-mono font-bold text-lg text-zinc-400 dark:text-[#57534e] group-hover:text-orange-500">02</span>
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-[#e7e5e4] mb-3">Verify & List</h3>
                <p className="text-zinc-500 dark:text-[#a8a29e] leading-relaxed mb-6">
                    A human expert reviews a sample of your dataset for quality and legal compliance before it goes live.
                </p>
                <div className="p-4 bg-orange-50 dark:bg-[#431407]/40 rounded-xl border border-orange-100 dark:border-orange-900/30">
                    <div className="flex items-center gap-3 text-sm text-orange-800 dark:text-orange-200">
                        <FileCheck className="w-4 h-4" />
                        <span>24-hour turnaround time</span>
                    </div>
                </div>
            </div>

            {/* Step 3 */}
            <div className="relative z-10 group">
                <div className="w-14 h-14 rounded-full bg-white dark:bg-[#1c1917] border-2 border-zinc-100 dark:border-[#292524] flex items-center justify-center mb-6 group-hover:border-green-600 dark:group-hover:border-green-500 transition-colors shadow-lg shadow-black/5 dark:shadow-none">
                    <span className="font-mono font-bold text-lg text-zinc-400 dark:text-[#57534e] group-hover:text-green-600 dark:group-hover:text-green-500">03</span>
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-[#e7e5e4] mb-3">Earn Royalties</h3>
                <p className="text-zinc-500 dark:text-[#a8a29e] leading-relaxed mb-6">
                    Agencies bid on your data. You get paid via Stripe or Crypto the moment a license is purchased.
                </p>
                <div className="p-4 bg-green-50 dark:bg-[#064e3b]/30 rounded-xl border border-green-100 dark:border-green-900/30">
                    <div className="flex items-center gap-3 text-sm text-green-800 dark:text-green-200">
                        <Coins className="w-4 h-4" />
                        <span>Instant payouts available</span>
                    </div>
                </div>
            </div>

        </div>
      </div>
    </section>
  );
}
