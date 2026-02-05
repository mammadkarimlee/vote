# Changes Summary

## UX & Navigation
- Added a global `Geri` (Back) button in the topbar that only activates when browser history allows a safe back navigation.
- Persisted the last visited route per user role and restored it on app entry, so the user returns to the exact page they were on instead of a fixed dashboard.
- Split Admin Dashboard and Branch Results into sectioned routes with segmented navigation to remove excessive scrolling.

## Layout & Visual System
- Rebuilt the UI foundation with a new light/dark design system, updated typography, and card-based layouts.
- Implemented a strict, symmetric icon menu grid (2/3/4/6 columns by breakpoint) with tighter spacing and consistent tile sizing.
- Improved table/data layouts by introducing `data-table` and `data-row` styles to avoid Tailwind utility collisions.

## Routing & Integration
- Updated routes for dashboard/results sections to use optional route segments (`/admin/dashboard/:section?`, `/branch/results/:section?`).
- Adjusted menu links to land on the correct sections by default.

## PKPD & Branch/Admin Pages
- Refined branch/admin pages to match the new style system, including cards, forms, and section headers.

## Misc
- Added UI affordances (segmented navigation, pills, badges, updated empty states) to improve readability and scanability.

---

If you want a more granular file-by-file change log, let me know.
