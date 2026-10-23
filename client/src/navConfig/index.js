import { createElement, lazy } from 'react';
import MissingModulePage from '../pages/MissingModulePage';

// Plugin-style navigation + route registry.
//
// Every `src/navConfig/*.nav.js` file is picked up automatically and must default-export an array of:
//   {
//     pageKey:   'inventory',                     // RBAC page key; must match server/src/rbac/pages/*.pages.js
//     path:      '/inventory',                    // route path (nested paths like '/inventory/:id' are fine)
//     label:     'Inventory',                     // sidebar label
//     icon:      Boxes,                           // optional lucide-react (or any) component
//     group:     'Inventory',                     // optional sidebar section, default 'General'
//     order:     100,                             // optional sort order inside the sidebar
//     component: 'inventory/pages/InventoryPage', // file under src/features/ (without .jsx), lazy loaded
//     showInNav: true,                            // optional; false = routable but hidden from the sidebar
//     action:    'view',                          // optional permission action required to open the route
//   }
//
// Components are resolved lazily from src/features/<feature>/pages/**. If the file does not exist
// yet, the route renders a "module not installed" placeholder instead of breaking the build.
const navModules = import.meta.glob('./*.nav.js', { eager: true });
const pageModules = import.meta.glob('../features/*/pages/**/*.jsx');

const lazyCache = new Map();

export function resolvePageComponent(component) {
  if (typeof component !== 'string') return component || MissingModulePage;
  if (!lazyCache.has(component)) {
    const loader = pageModules[`../features/${component}.jsx`];
    lazyCache.set(
      component,
      loader ? lazy(loader) : function Missing() {
        return createElement(MissingModulePage, { component });
      },
    );
  }
  return lazyCache.get(component);
}

function collectEntries() {
  const entries = [];
  const seenPaths = new Map();
  for (const [file, mod] of Object.entries(navModules).sort(([a], [b]) => a.localeCompare(b))) {
    const list = Array.isArray(mod.default) ? mod.default : [];
    for (const entry of list) {
      if (!entry?.pageKey || !entry?.path) {
        console.warn(`[navConfig] ${file}: entries need pageKey and path`, entry);
        continue;
      }
      if (seenPaths.has(entry.path)) {
        console.warn(`[navConfig] ${file}: path ${entry.path} already registered by ${seenPaths.get(entry.path)}`);
        continue;
      }
      seenPaths.set(entry.path, file);
      entries.push({ group: 'General', order: 100, showInNav: true, action: 'view', ...entry, source: file });
    }
  }
  return entries.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export const navEntries = collectEntries();

// Sidebar sections visible to the current user, ordered by the lowest `order` in each group.
export function visibleNavGroups(permissions) {
  const groups = new Map();
  for (const entry of navEntries) {
    if (!entry.showInNav || !permissions[entry.pageKey]?.[entry.action]) continue;
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }
  return [...groups.entries()]
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => a.items[0].order - b.items[0].order);
}
