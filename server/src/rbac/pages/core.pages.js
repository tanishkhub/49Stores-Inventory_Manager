// Page definitions for the foundation. Feature modules add their own `<feature>.pages.js` file
// next to this one; see README "Adding a feature module".
//
// Each entry:
//   key                 unique page key, shared with the client navConfig entry (kebab-case)
//   label, group, order  shown in the Roles & Permissions matrix
//   actions             subset of ['view', 'add', 'update', 'delete'] that apply to this page
//   defaultPermissions  { <roleKey>: [actions] } applied only when a role has no record for the page yet
//                       (Super Admin always has full access and needs no entry)
module.exports = [
  {
    key: 'home',
    label: 'Home',
    group: 'General',
    order: 0,
    description: 'Landing page after login.',
    actions: ['view'],
    defaultPermissions: {
      inventory_manager: ['view'],
    },
  },
  {
    key: 'users',
    label: 'Users',
    group: 'Administration',
    order: 900,
    description: 'Create users, assign roles and stores.',
    actions: ['view', 'add', 'update', 'delete'],
    defaultPermissions: {},
  },
  {
    key: 'roles',
    label: 'Roles & Permissions',
    group: 'Administration',
    order: 910,
    description: 'Create roles and toggle page visibility / actions per role.',
    actions: ['view', 'add', 'update', 'delete'],
    defaultPermissions: {},
  },
];
