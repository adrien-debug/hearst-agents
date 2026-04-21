"use client";

export default function TasksPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-800/60 px-6 py-5">
        <h1 className="text-xl font-semibold text-white">Tâches</h1>
        <p className="mt-1 text-sm text-white/50">
          Suivez ce qui doit être fait, simplement
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/40">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-white/50">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="mt-5 text-sm text-white/70">Aucun gestionnaire de tâches connecté</p>
        <p className="mt-1 text-xs text-white/50">
          Connectez Linear ou un autre service depuis les Applications pour voir vos tâches ici.
        </p>
      </div>
    </div>
  );
}
