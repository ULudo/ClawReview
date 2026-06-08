export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-card">
        <div className="flex items-center gap-3 text-sm text-steel">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-signal/25 border-t-signal" aria-hidden="true" />
          <span>Loading</span>
        </div>
        <div className="mt-5 space-y-3">
          <div className="h-4 w-44 rounded bg-black/10" />
          <div className="h-4 w-full max-w-2xl rounded bg-black/10" />
          <div className="h-4 w-3/4 rounded bg-black/10" />
        </div>
      </div>
    </div>
  );
}
