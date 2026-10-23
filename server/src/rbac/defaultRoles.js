// Default roles created by the seed script. Roles are ordinary DB records: Super Admin can
// rename them, edit descriptions, change their permissions and create new roles at runtime.
module.exports = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full access to every page and action, including user and role management.',
    isSystem: true,
    isSuperAdmin: true,
  },
  {
    key: 'inventory_manager',
    name: 'Inventory Manager',
    description: 'Manages stores, products, stock levels and barcode labels.',
    isSystem: true,
  },
  {
    key: 'store_sales_person',
    name: 'Store Sales Person',
    description: 'Runs the point of sale and looks up customers in assigned stores.',
    isSystem: true,
  },
];
