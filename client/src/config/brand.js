// Single source of truth for branding. To change the logo everywhere (favicon, sidebar, login
// animation, page loaders, receipts/labels that use <Logo />), replace public/brand/logo.svg
// (and logo.png, used as the touch icon) with files of the same name. No code changes needed.
export const APP_NAME = import.meta.env.VITE_APP_NAME || '49Stores';
export const LOGO_URL = '/brand/logo.svg';
