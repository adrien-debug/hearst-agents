"use client";
// lint-visual-disable-file

/**
 * Page démo isolée du Design System Hearst OS.
 *
 * Cette page est volontairement détachée du DS de l'app : couleurs Tailwind
 * directes (slate / teal / blue / indigo), magic numbers (rounded-[24px],
 * text-6xl, tracking-[0.2em]) et utilitaires `shadow-2xl` / `shadow-xl`
 * sont intentionnels — c'est une présentation produit/PDF print 16:9
 * (slides commerciales, hero visuels), conçue pour vivre hors du langage
 * visuel cockpit (PulseBar / TimelineRail / Stage).
 *
 * Voir CLAUDE.md §Voix éditoriale 2026-04-29 — la page reste à part pour
 * éviter de polluer le scope strict du DS. Si elle migre un jour dans
 * l'app, retirer le pragma `lint-visual-disable-file` et convertir en
 * tokens var(--*).
 */

import React from "react";

export default function PresentationPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-teal-200">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { 
            size: 1920px 1080px; /* Force un format paysage type écran/slide 16:9 pour la présentation */
            margin: 0; 
          }
          html, body {
            width: 1920px !important;
            height: 1080px !important;
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-hidden { 
            display: none !important; 
          }
          .page-slide {
            width: 1920px !important;
            height: 1080px !important;
            page-break-after: always;
            page-break-inside: avoid;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: center;
            box-sizing: border-box;
          }
          /* Override grid/flex if necessary to maintain exact sizes in print */
          * { 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
          }
        }
      `}} />

      {/* Floating PDF Button */}
      <button 
        onClick={() => window.print()} 
        className="print-hidden fixed bottom-8 right-8 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl hover:shadow-cyan-500/20 hover:bg-slate-800 hover:-translate-y-1 transition-all duration-300 font-medium tracking-wide z-50 flex items-center gap-2 border border-slate-700"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download PDF
      </button>

      {/* PAGE 1: Cover */}
      <section className="page-slide relative w-full min-h-screen flex flex-col justify-center items-center p-16 md:p-24 bg-gradient-to-br from-white to-slate-50 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[80%] rounded-full bg-teal-50/60 blur-[120px]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[70%] rounded-full bg-blue-50/50 blur-[100px]" />
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wMikiLz48L3N2Zz4=')] opacity-50" />
        </div>

        <div className="relative z-10 max-w-6xl w-full flex flex-col items-center text-center gap-8">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/80 backdrop-blur-md shadow-sm border border-slate-200/60 mb-2">
            <div className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)] animate-pulse" />
            <span className="t-11 font-bold tracking-[0.2em] uppercase text-slate-600">Product Vision</span>
          </div>
          
          <h1 className="text-6xl md:text-[5.5rem] font-bold tracking-[-0.02em] text-slate-900 leading-[1.05]">
            Shaping the Future <br/> of <span className="text-teal-600 relative whitespace-nowrap">
              Digital 
              <span className="absolute bottom-2 left-0 w-full h-3 bg-teal-100/50 -z-10 -rotate-1"></span>
            </span> Experiences
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-500 max-w-3xl font-light leading-relaxed tracking-tight">
            A modern, pixel-perfect presentation framework designed for clarity, impact, and seamless printability.
          </p>

          {/* Large Cover Placeholder */}
          <div className="w-full aspect-[21/9] mt-12 bg-slate-100/80 border border-slate-200/80 rounded-[32px] overflow-hidden flex items-center justify-center shadow-2xl backdrop-blur-sm relative group">
            <div className="absolute inset-0 bg-gradient-to-tr from-slate-200/50 to-transparent opacity-60" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="px-6 py-3 rounded-full bg-white/60 backdrop-blur-md border border-white shadow-sm flex items-center gap-3 transition-transform group-hover:scale-105">
                <div className="w-5 h-5 rounded-[4px] bg-slate-200" />
                <span className="text-slate-500 font-semibold tracking-widest uppercase text-xs">Hero Visual [21:9]</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PAGE 2: Features Grid */}
      <section className="page-slide relative w-full min-h-screen bg-white p-16 md:p-24 flex flex-col justify-center">
        <div className="max-w-7xl w-full mx-auto flex flex-col gap-16">
          
          <div className="flex flex-col gap-4 max-w-4xl">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
              Absolute Precision & Scale
            </h2>
            <p className="text-xl text-slate-500 leading-relaxed font-light">
              Built on a strict 8px spatial system. Every component aligns perfectly to deliver an uncompromised sense of order, space, and premium quality.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-slate-50/50 rounded-3xl p-10 border border-slate-100 hover:bg-white hover:shadow-xl hover:-translate-y-1 transition-all duration-400 group">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100/50 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300">
                <div className="w-5 h-5 bg-teal-500 rounded-[6px] shadow-sm" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">Structural Clarity</h3>
              <p className="text-slate-500 leading-relaxed font-light text-lg">Margins, paddings, and line-heights calibrated for effortless reading and absolute visual balance.</p>
            </div>

            {/* Card 2 */}
            <div className="bg-slate-50/50 rounded-3xl p-10 border border-slate-100 hover:bg-white hover:shadow-xl hover:-translate-y-1 transition-all duration-400 group">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100/50 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300">
                <div className="w-5 h-5 bg-blue-500 rounded-[6px] shadow-sm" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">Vibrant Restraint</h3>
              <p className="text-slate-500 leading-relaxed font-light text-lg">Colors act as precise guides rather than overwhelming floods, keeping the interface crisp and airy.</p>
            </div>

            {/* Card 3 */}
            <div className="bg-slate-50/50 rounded-3xl p-10 border border-slate-100 hover:bg-white hover:shadow-xl hover:-translate-y-1 transition-all duration-400 group">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100/50 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300">
                <div className="w-5 h-5 bg-indigo-500 rounded-[6px] shadow-sm" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">PDF Optimized</h3>
              <p className="text-slate-500 leading-relaxed font-light text-lg">Engineered for seamless A4/16:9 PDF export. No awkward breaks, no missing backgrounds.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-4">
            <div className="bg-slate-100/60 rounded-[24px] aspect-[21/9] flex items-center justify-center border border-slate-200/60 relative overflow-hidden group">
              <div className="px-5 py-2.5 rounded-full bg-white/70 backdrop-blur-sm border border-slate-100 shadow-sm flex items-center gap-2 group-hover:scale-105 transition-transform">
                <span className="text-slate-500 font-bold tracking-[0.15em] uppercase t-10">Data Viz [21:9]</span>
              </div>
            </div>
            <div className="bg-slate-100/60 rounded-[24px] aspect-[21/9] flex items-center justify-center border border-slate-200/60 relative overflow-hidden group">
              <div className="px-5 py-2.5 rounded-full bg-white/70 backdrop-blur-sm border border-slate-100 shadow-sm flex items-center gap-2 group-hover:scale-105 transition-transform">
                <span className="text-slate-500 font-bold tracking-[0.15em] uppercase t-10">Product Shot [21:9]</span>
              </div>
            </div>
          </div>
          
        </div>
      </section>

      {/* PAGE 3: Deep Layout */}
      <section className="page-slide relative w-full min-h-screen bg-slate-50/50 p-16 md:p-24 flex flex-col justify-center border-t border-slate-100">
        <div className="max-w-7xl w-full mx-auto flex flex-col md:flex-row items-center gap-20">
          
          <div className="flex-1 w-full space-y-12">
            <div className="space-y-6">
              <div className="inline-block px-4 py-1.5 rounded-md bg-white border border-slate-200 shadow-sm">
                <span className="t-10 font-bold tracking-[0.2em] uppercase text-slate-500">Methodology</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight leading-[1.1]">
                Space as a <br/> first-class citizen.
              </h2>
              <p className="text-xl text-slate-500 leading-relaxed font-light">
                We believe in the power of whitespace. Every visual element is given the room it needs to breathe, ensuring your core message is the only thing that stands out.
              </p>
            </div>

            <div className="flex flex-col gap-8">
              <div className="flex items-start gap-5">
                <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm shrink-0 border border-teal-200/50 mt-1">01</div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 mb-1">Zero Overlap Guarantee</h4>
                  <p className="text-slate-500 font-light text-lg">Elements are strictly boxed within their containers, avoiding visual collisions.</p>
                </div>
              </div>
              <div className="flex items-start gap-5">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0 border border-indigo-200/50 mt-1">02</div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 mb-1">Dynamic Print Scaling</h4>
                  <p className="text-slate-500 font-light text-lg">Fonts and layout structures adjust intelligently to physical paper bounds.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 w-full relative flex justify-end">
            <div className="w-[85%] aspect-[4/5] bg-white rounded-[32px] border border-slate-200 shadow-2xl flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
              <div className="px-6 py-3 rounded-full bg-white/80 backdrop-blur-md border border-slate-100 shadow-lg flex items-center gap-2 z-10 group-hover:scale-105 transition-transform">
                <span className="text-slate-600 font-bold tracking-[0.15em] uppercase text-xs">Portrait Media [4:5]</span>
              </div>
            </div>
            
            {/* Floating mini placeholder */}
            <div className="absolute bottom-12 left-0 w-64 aspect-[4/3] bg-slate-900 rounded-[24px] shadow-2xl flex items-center justify-center border-[6px] border-slate-50 overflow-hidden group">
              <div className="px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center gap-2 group-hover:scale-105 transition-transform">
                <span className="text-white/80 font-bold tracking-[0.15em] uppercase t-9">Detail Overlay</span>
              </div>
            </div>
          </div>

        </div>
      </section>

    </div>
  );
}
