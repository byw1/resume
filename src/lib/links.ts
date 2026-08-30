/**
 * Addresses that belong to the project rather than to your instance.
 *
 * The manual documents the software, so it is the same URL wherever this is
 * running — a self-hoster on their own domain reads the same pages the hosted
 * instance does. That makes it a constant rather than a setting, and this file
 * exists so it is typed once instead of in every screen that links to it.
 */
export const MANUAL_URL = "https://docs.hired.tools";

/** Deep links into the manual, so a screen can point at the page it is about. */
export const manual = (path: string) => `${MANUAL_URL}${path}`;
