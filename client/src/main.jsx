import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AppRoutes from './routes/AppRoutes';
import { APP_NAME } from './config/brand';
import './index.css';

document.title = APP_NAME;

console.log(
  '%c 49STORES %c INVENTORY %c Tanishk Shrivastava %c tanishk.49stores.com ',
  // 1. Glowing Teal Badge
  'background: #0f766e; color: #ccfbf1; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 4px 0 0 4px; letter-spacing: 0.8px; line-height: 18px;',
  // 2. Pill Tag
  'background: #134e4a; color: #5eead4; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; font-weight: 700; padding: 6px 8px; border-top: 1px solid #115e59; border-bottom: 1px solid #115e59; line-height: 18px;',
  // 3. Body text
  'background: #09090b; color: #d4d4d8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; font-weight: 500; padding: 6px 12px; border-top: 1px solid #27272a; border-bottom: 1px solid #27272a; line-height: 18px;',
  // 4. Subtle Bordered Link
  'background: #09090b; color: #2dd4bf; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; font-weight: 600; padding: 6px 12px; border: 1px solid #27272a; border-left: 1px solid #14b8a6; border-radius: 0 4px 4px 0; line-height: 18px;'
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
