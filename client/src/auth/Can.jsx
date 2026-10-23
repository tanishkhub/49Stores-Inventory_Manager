import { usePermission } from './hooks';

// <Can page="inventory" action="add"><button>Add item</button></Can>
export default function Can({ page, action = 'view', fallback = null, children }) {
  const permission = usePermission(page);
  return permission[action] ? children : fallback;
}
