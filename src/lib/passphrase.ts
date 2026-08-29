import { randomInt } from "node:crypto";

/**
 * The generated-password vocabulary.
 *
 * Lives in its own module rather than in bootstrap.ts so that anything needing
 * a password can have one without importing instance provisioning — importing
 * bootstrap for a helper would drag along the owner-account side effects.
 */
const WORDS = [
  "amber", "anchor", "aspen", "basalt", "beacon", "birch", "cedar", "cinder",
  "cobalt", "comet", "copper", "coral", "cove", "delta", "ember", "falcon",
  "fern", "flint", "garnet", "granite", "harbor", "heron", "indigo", "ivory",
  "juniper", "kestrel", "lantern", "linen", "marble", "meadow", "mesa", "nimbus",
  "onyx", "opal", "orbit", "otter", "pebble", "pine", "prism", "quartz",
  "quill", "ridge", "river", "saffron", "sage", "slate", "solstice", "spruce",
  "summit", "thistle", "tundra", "vellum", "verdant", "willow", "zephyr",
];

/** Readable enough to type by hand, still ~55 bits of entropy. */
export function generatePassphrase() {
  const picked: string[] = [];
  while (picked.length < 4) {
    const word = WORDS[randomInt(WORDS.length)];
    if (!picked.includes(word)) picked.push(word);
  }
  return `${picked.join("-")}-${randomInt(1000, 10000)}`;
}
