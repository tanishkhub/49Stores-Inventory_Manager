import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <p className="text-4xl font-bold text-brand-600">404</p>
      <h1 className="mt-2 text-lg font-semibold">Page not found</h1>
      <Link to="/" className="btn-secondary mt-6">Go home</Link>
    </div>
  );
}
