import { redirect } from "next/navigation";

/**
 * Admin moved under Settings, where instance configuration already lives —
 * the same shape Twenty uses. This redirect stays because /admin was linked
 * from the profile menu for months and is in people's history and bookmarks;
 * a dead URL is a worse migration than a permanent forward.
 */
export default function AdminMoved() {
  redirect("/settings/admin");
}
