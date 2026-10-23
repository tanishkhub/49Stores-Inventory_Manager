// Module C (POS), Module D (customers) and Module E (sales dashboard) page definitions.
module.exports = [
  {
    key: 'pos',
    label: 'Point of Sale',
    group: 'Sales',
    order: 200,
    description: 'Scan products, sell memberships, check out and process returns/exchanges (add = create sales/returns).',
    actions: ['view', 'add'],
    defaultPermissions: {
      store_sales_person: ['view', 'add'],
    },
  },
  {
    key: 'customers',
    label: 'Customers',
    group: 'Sales',
    order: 210,
    description: 'Customer records (deduplicated by phone) and purchase history.',
    actions: ['view', 'update', 'delete'],
    defaultPermissions: {
      store_sales_person: ['view'],
    },
  },
  {
    key: 'sales',
    label: 'Sales Dashboard',
    group: 'Sales',
    order: 220,
    description: 'Filter sales by store, date, product or customer and export to CSV / Excel.',
    actions: ['view'],
    defaultPermissions: {},
  },
  {
    key: 'memberships',
    label: 'Memberships',
    group: 'Sales',
    order: 230,
    description: 'Membership plans: billing options (months/price) and member discounts.',
    actions: ['view', 'add', 'update', 'delete'],
    defaultPermissions: {},
  },
];
