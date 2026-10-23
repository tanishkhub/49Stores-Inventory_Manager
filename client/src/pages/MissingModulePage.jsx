import { PackageOpen } from 'lucide-react';

// Rendered when a navConfig entry points at a feature page file that does not exist (yet).
export default function MissingModulePage({ component }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <PackageOpen className="mx-auto h-10 w-10 text-slate-400" />
      <h1 className="mt-4 text-lg font-semibold">Module not installed</h1>
      <p className="mt-2 text-sm text-slate-500">
        This page is registered but its component{component ? <> <code className="rounded bg-slate-100 px-1">src/features/{component}.jsx</code></> : ''} was not found.
      </p>
    </div>
  );
}
