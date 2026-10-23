import { House, ShieldCheck, Users } from 'lucide-react';

// Foundation pages. Feature modules add their own `<feature>.nav.js` file in this folder.
// See navConfig/index.js for the entry format.
export default [
  {
    pageKey: 'home',
    path: '/',
    label: 'Home',
    icon: House,
    group: 'General',
    order: 0,
    component: 'core/pages/HomePage',
  },
  {
    pageKey: 'users',
    path: '/admin/users',
    label: 'Users',
    icon: Users,
    group: 'Administration',
    order: 900,
    component: 'core/pages/UsersPage',
  },
  {
    pageKey: 'roles',
    path: '/admin/roles',
    label: 'Roles & Permissions',
    icon: ShieldCheck,
    group: 'Administration',
    order: 910,
    component: 'core/pages/RolesPage',
  },
];
