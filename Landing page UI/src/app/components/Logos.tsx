import React from "react";
import { Hexagon, Database, Cpu, Globe, Network } from "lucide-react";

export function Logos() {
  return (
    <section className="py-12 bg-white dark:bg-[#0c0a09] border-y border-zinc-100 dark:border-[#1c1917] overflow-hidden transition-colors duration-500">
      <div className="container mx-auto px-6 mb-8">
        <p className="text-center text-xs font-bold tracking-widest text-zinc-400 dark:text-[#57534e] uppercase">
          Trusted by leading AI Labs
        </p>
      </div>
      
      {/* Marquee Effect */}
      <div className="relative flex overflow-x-hidden group">
        <div className="animate-marquee whitespace-nowrap flex gap-20 items-center">
            {/* Duplicate content for seamless loop */}
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-20 items-center opacity-40 grayscale group-hover:grayscale-0 transition-all duration-500">
                    <div className="flex items-center gap-2"><Hexagon className="w-6 h-6 text-zinc-900 dark:text-[#e7e5e4]" /><span className="text-xl font-bold text-zinc-800 dark:text-[#a8a29e]">HexaAI</span></div>
                    <div className="flex items-center gap-2"><Database className="w-6 h-6 text-blue-600 dark:text-blue-400" /><span className="text-xl font-bold text-zinc-800 dark:text-[#a8a29e]">DataFlow</span></div>
                    <div className="flex items-center gap-2"><Cpu className="w-6 h-6 text-orange-600 dark:text-orange-400" /><span className="text-xl font-bold text-zinc-800 dark:text-[#a8a29e]">RoboLearn</span></div>
                    <div className="flex items-center gap-2"><Network className="w-6 h-6 text-purple-600 dark:text-purple-400" /><span className="text-xl font-bold text-zinc-800 dark:text-[#a8a29e]">NeuroNet</span></div>
                    <div className="flex items-center gap-2"><Globe className="w-6 h-6 text-green-600 dark:text-green-400" /><span className="text-xl font-bold text-zinc-800 dark:text-[#a8a29e]">GlobalData</span></div>
                </div>
            ))}
        </div>
      </div>
    </section>
  );
}
