'use client';

export function SkeletonCard() {
  return (
    <div className="glass rounded-xl p-5 flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full skeleton-shimmer" />
          <div className="flex flex-col gap-2">
            <div className="h-4 w-24 rounded skeleton-shimmer" />
            <div className="h-3 w-16 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="h-5 w-16 rounded-full skeleton-shimmer" />
      </div>
      <div className="mt-auto">
        <div className="h-3 w-full rounded skeleton-shimmer mb-2" />
        <div className="h-3 w-3/4 rounded skeleton-shimmer" />
        <div className="mt-4 pt-4 border-t border-white/5">
          <div className="h-3 w-20 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <tr>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded skeleton-shimmer" />
          <div className="h-4 w-20 rounded skeleton-shimmer" />
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-32 rounded skeleton-shimmer" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-48 rounded skeleton-shimmer" />
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col items-end gap-1">
          <div className="h-3 w-12 rounded skeleton-shimmer" />
          <div className="h-1 w-16 rounded-full skeleton-shimmer" />
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="h-3 w-16 rounded skeleton-shimmer ml-auto" />
      </td>
    </tr>
  );
}

export function SkeletonChart() {
  return (
    <div className="glass rounded-xl p-6 lg:col-span-2">
      <div className="h-5 w-48 rounded skeleton-shimmer mb-6" />
      <div className="h-[400px] w-full flex items-end gap-4 px-8 pb-10">
        {[65, 80, 45, 90, 55, 70, 40].map((h, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end items-center gap-2">
            <div
              className="w-full rounded-t skeleton-shimmer"
              style={{ height: `${h}%` }}
            />
            <div className="h-3 w-10 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCanvas() {
  return (
    <div className="glass-panel rounded-2xl p-1 relative overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      <div className="rounded-xl overflow-hidden bg-[#05050a] border border-white/5">
        <div className="h-[400px] w-full skeleton-shimmer" />
      </div>
    </div>
  );
}

export function SkeletonUsageTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass rounded-xl p-0 overflow-hidden flex flex-col">
      <div className="p-6 border-b border-white/5 bg-black/10">
        <div className="h-5 w-36 rounded skeleton-shimmer" />
      </div>
      <div className="overflow-auto flex-1 max-h-[400px]">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 uppercase bg-black/20 sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-6 py-3 font-semibold">Agent</th>
              <th className="px-6 py-3 font-semibold text-right">Tokens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-3"><div className="h-4 w-24 rounded skeleton-shimmer" /></td>
                <td className="px-6 py-3"><div className="h-4 w-16 rounded skeleton-shimmer ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-28 rounded skeleton-shimmer" />
        <div className="w-8 h-8 rounded skeleton-shimmer" />
      </div>
      <div className="h-7 w-20 rounded skeleton-shimmer mb-2" />
      <div className="h-3 w-24 rounded skeleton-shimmer" />
    </div>
  );
}
