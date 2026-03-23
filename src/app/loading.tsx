export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 cursor-progress bg-[rgba(244,240,230,0.24)]">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-3 rounded-full border border-black/10 bg-white/95 px-4 py-2 text-sm text-steel shadow-card backdrop-blur"
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-signal/25 border-t-signal" aria-hidden="true" />
        <span>Loading</span>
      </div>
    </div>
  );
}
