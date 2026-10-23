import { Barcode, Boxes, Package, Store } from 'lucide-react';

// Module A (stores, products, inventory) and Module B (barcode labels).
export default [
  { pageKey: 'stores', path: '/stores', label: 'Stores', icon: Store, group: 'Inventory', order: 100, component: 'stores/pages/StoresPage' },
  { pageKey: 'products', path: '/products', label: 'Products', icon: Package, group: 'Inventory', order: 110, component: 'products/pages/ProductsPage' },
  { pageKey: 'inventory', path: '/inventory', label: 'Inventory', icon: Boxes, group: 'Inventory', order: 120, component: 'inventory/pages/InventoryPage' },
  { pageKey: 'barcode-labels', path: '/labels', label: 'Barcode / Labels', icon: Barcode, group: 'Inventory', order: 130, component: 'barcodes/pages/LabelsPage' },
];
