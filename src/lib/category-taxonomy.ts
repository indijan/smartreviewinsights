export type CategoryNode = {
  path: string;
  label: string;
  children?: CategoryNode[];
};

export const CATEGORY_TAXONOMY: CategoryNode[] = [
  {
    path: "electronics",
    label: "Electronics",
    children: [
      { path: "electronics/apple-products", label: "Apple Products" },
      { path: "electronics/camera", label: "Camera" },
      { path: "electronics/car-vehicle-electronics", label: "Car & Vehicle Electronics" },
      { path: "electronics/cell-phone-accessories", label: "Cell Phone Accessories" },
      { path: "electronics/cell-phone-chargers-power-adapters", label: "Cell Phone Chargers & Power Adapters" },
      { path: "electronics/computers-accessories", label: "Computers & Accessories" },
      { path: "electronics/computers-tablets", label: "Computers & Tablets" },
      { path: "electronics/earbuds-accessories", label: "Earbuds & Accessories" },
      { path: "electronics/headphones", label: "Headphones" },
      { path: "electronics/health-monitor", label: "Health Monitor" },
      { path: "electronics/musical-instruments", label: "Musical Instruments" },
      { path: "electronics/portable-power-station", label: "Portable Power Station" },
      { path: "electronics/portable-speakers", label: "Portable Speakers" },
      { path: "electronics/projector", label: "Projector" },
      { path: "electronics/robot-vacuum-cleaner", label: "Robot Vacuum Cleaner" },
      { path: "electronics/smart-home", label: "Smart Home" },
      { path: "electronics/smartwatches", label: "Smartwatches" },
      { path: "electronics/tools-home-improvement", label: "Tools & Home Improvement" },
      { path: "electronics/tv", label: "TV" },
      { path: "electronics/video-game-consoles-accessories", label: "Video Game Consoles & Accessories" },
      { path: "electronics/virtual-reality", label: "Virtual Reality" },
    ],
  },
  {
    path: "lifestyle",
    label: "Lifestyle",
    children: [
      { path: "lifestyle/fashion", label: "Fashion" },
      { path: "lifestyle/furniture", label: "Furniture" },
    ],
  },
  {
    path: "pet-supplies",
    label: "Pet Supplies",
    children: [{ path: "pet-supplies/dog", label: "Dog" }],
  },
  { path: "toys-games", label: "Toys & Games" },
  { path: "travel", label: "Travel" },
];

export function categoryLabel(path: string): string {
  const all = CATEGORY_TAXONOMY.flatMap((node) => [node, ...(node.children ?? [])]);
  const found = all.find((node) => node.path === path);
  if (found) return found.label;

  return (
    path
      .split("/")
      .pop()
      ?.replace(/-/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase()) || path
  );
}

export function categoryLeafNodes() {
  return CATEGORY_TAXONOMY.flatMap((node) => node.children ?? [node]);
}

export function categoryAutomationNodes() {
  return CATEGORY_TAXONOMY.flatMap((node) => [node, ...(node.children ?? [])]);
}

export function categoryDescendantLeafSlugs(categoryPath: string): string[] {
  const node = CATEGORY_TAXONOMY.find((n) => n.path === categoryPath);
  if (!node) {
    const leaf = categoryPath.split("/").pop() || categoryPath;
    return [leaf];
  }

  const leaves = node.children ?? [node];
  return leaves.map((leaf) => leaf.path.split("/").pop() || leaf.path);
}

export function getCategoryNode(path: string): CategoryNode | null {
  for (const node of CATEGORY_TAXONOMY) {
    if (node.path === path) return node;
    const child = node.children?.find((item) => item.path === path);
    if (child) return child;
  }
  return null;
}

export function getCategoryParent(path: string): CategoryNode | null {
  for (const node of CATEGORY_TAXONOMY) {
    if (node.children?.some((child) => child.path === path)) return node;
  }
  return null;
}

export function getCategoryChildren(path: string): CategoryNode[] {
  const node = CATEGORY_TAXONOMY.find((item) => item.path === path);
  return node?.children ?? [];
}

export function getCategorySiblings(path: string): CategoryNode[] {
  const parent = getCategoryParent(path);
  if (!parent?.children) return [];
  return parent.children.filter((child) => child.path !== path);
}

export function categoryIntro(path: string): string {
  const label = categoryLabel(path);
  const parent = getCategoryParent(path);
  if (parent) {
    return `Explore ${label.toLowerCase()} reviews, comparisons, and buying advice within our ${parent.label.toLowerCase()} coverage. We focus on standout models, practical tradeoffs, and live offer context.`;
  }
  return `Explore ${label.toLowerCase()} reviews, comparisons, and buying guides curated to help you narrow down the right option faster.`;
}
