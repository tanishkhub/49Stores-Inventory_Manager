import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AppRoutes from './routes/AppRoutes';
import { APP_NAME } from './config/brand';
import './index.css';

document.title = APP_NAME;

console.log(
  '%c49Stores%c Inventory Manager',
  'background:#facc15;color:#0a0a0a;font-size:20px;font-weight:900;padding:6px 10px;border-radius:6px 0 0 6px',
  'background:#0a0a0a;color:#facc15;font-size:20px;font-weight:700;padding:6px 10px;border-radius:0 6px 6px 0',
);
console.log(
  '%cHandcrafted by Tanishk Shrivastava\n%chttps://tanishk.49stores.com',
  'color:#a1a1aa;font-size:12px',
  'color:#facc15;font-size:12px',
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
