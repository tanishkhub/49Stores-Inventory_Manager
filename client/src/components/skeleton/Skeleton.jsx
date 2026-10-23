// Skeleton placeholders. Show these while data loads instead of spinners so layouts don't jump.
export function Skeleton({ className = 'h-4 w-full' }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      <Skeleton className="mb-4 h-10 w-10 rounded-lg" />
      <Skeleton className="mb-3 h-4 w-1/2" />
      <SkeletonText lines={2} />
    </div>
  );
}

// Rows for a <tbody>. Pass the number of columns of the surrounding table.
export function SkeletonTableRows({ rows = 5, columns = 4 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} className="border-t border-slate-100">
      {Array.from({ length: columns }, (_, c) => (
        <td key={c} className="px-4 py-3">
          <Skeleton className={`h-4 ${c === 0 ? 'w-3/4' : 'w-1/2'}`} />
        </td>
      ))}
    </tr>
  ));
}

// Default Suspense fallback for lazy-loaded pages.
export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="card p-5">
        <SkeletonText lines={5} />
      </div>
    </div>
  );
}
