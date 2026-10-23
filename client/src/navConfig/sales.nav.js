import { BadgePercent, ChartColumn, ScanBarcode, UserRound } from 'lucide-react';

// Module C (POS), Module D (customers) and Module E (sales dashboard).
export default [
  { pageKey: 'pos', path: '/pos', label: 'Point of Sale', icon: ScanBarcode, group: 'Sales', order: 200, component: 'pos/pages/PosPage' },
  { pageKey: 'customers', path: '/customers', label: 'Customers', icon: UserRound, group: 'Sales', order: 210, component: 'customers/pages/CustomersPage' },
  { pageKey: 'sales', path: '/sales', label: 'Sales Dashboard', icon: ChartColumn, group: 'Sales', order: 220, component: 'sales/pages/SalesDashboardPage' },
  { pageKey: 'memberships', path: '/memberships', label: 'Memberships', icon: BadgePercent, group: 'Sales', order: 230, component: 'memberships/pages/MembershipsPage' },
];
