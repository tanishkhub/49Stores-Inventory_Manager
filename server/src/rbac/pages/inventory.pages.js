// Module A (stores, products, inventory) and Module B (barcode labels) page definitions.
module.exports = [
  {
    key: 'stores',
    label: 'Stores',
    group: 'Inventory',
    order: 100,
    description: 'Create, edit and deactivate store locations.',
    actions: ['view', 'add', 'update', 'delete'],
    defaultPermissions: {
      inventory_manager: ['view'],
    },
  },
  {
    key: 'products',
    label: 'Products',
    group: 'Inventory',
    order: 110,
    description: 'Product catalog with images, prices and barcode mapping.',
    actions: ['view', 'add', 'update', 'delete'],
    defaultPermissions: {
      inventory_manager: ['view', 'add', 'update', 'delete'],
    },
  },
  {
    key: 'inventory',
    label: 'Inventory',
    group: 'Inventory',
    order: 120,
    description: 'Per-store stock levels for every product.',
    actions: ['view', 'add', 'update', 'delete'],
    defaultPermissions: {
      inventory_manager: ['view', 'add', 'update', 'delete'],
    },
  },
  {
    key: 'barcode-labels',
    label: 'Barcode / Labels',
    group: 'Inventory',
    order: 130,
    description: 'Preview and print barcode labels (thermal or A4).',
    actions: ['view'],
    defaultPermissions: {
      inventory_manager: ['view'],
    },
  },
];
