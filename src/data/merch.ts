import { BadgeDollarSign, Boxes, ImagePlus, Shirt, ShoppingBag, Store } from "lucide-react";

export type MerchProduct = {
  name: string;
  character: string;
  type: string;
  artwork: string;
  providerFit: string;
  status: "design-ready" | "needs-cutout" | "mockup-next";
};

export const merchAgents = [
  {
    name: "Merch Brand Director",
    role: "Turns characters, slogans, sigils, props, and episode moments into product lines.",
    owns: ["drop themes", "brand rules", "SKU naming", "collection strategy"],
    icon: BadgeDollarSign,
  },
  {
    name: "POD Production Agent",
    role: "Prepares transparent PNG print files, mockups, provider specs, and product manifests.",
    owns: ["Printful adapter", "Printify adapter", "mockup queue", "print safe checks"],
    icon: Boxes,
  },
  {
    name: "Storefront Builder",
    role: "Builds the public Opaija website/store, collection pages, product detail pages, and launch capture.",
    owns: ["domain site", "store UI", "email capture", "product storytelling"],
    icon: Store,
  },
];

export const merchProducts: MerchProduct[] = [
  {
    name: "Eat First. Panic After.",
    character: "Mother Lall",
    type: "tee / apron / mug",
    artwork: "Mother Lall line art + doubles tray + sigil",
    providerFit: "Printful or Printify",
    status: "mockup-next",
  },
  {
    name: "Hold Beat! Hold Beat!",
    character: "Jabari",
    type: "tee / hoodie / sticker",
    artwork: "Jabs drum pose + orange rhythm ring",
    providerFit: "Printful or Printify",
    status: "design-ready",
  },
  {
    name: "The Tide Teaches Patience",
    character: "Tariq",
    type: "poster / shirt / phone case",
    artwork: "Tidewatch mark + sea cloth strips",
    providerFit: "Printify catalog breadth",
    status: "design-ready",
  },
  {
    name: "Break the Beat. Build the Legacy.",
    character: "Malik",
    type: "training tee / poster",
    artwork: "Rootbreaker red-black impact frame",
    providerFit: "Printful mockup quality",
    status: "needs-cutout",
  },
  {
    name: "Opaija Core Mark",
    character: "Brand",
    type: "hat / sticker / notebook / premium hoodie",
    artwork: "Opaija sigil and rhythm-root pattern",
    providerFit: "Printful or Printify",
    status: "mockup-next",
  },
  {
    name: "The Stick Is Not A Gift",
    character: "Papa Etienne",
    type: "tee / poster / cane prop card",
    artwork: "Papa Etienne cane pose + root pulse ring",
    providerFit: "Printful poster and apparel",
    status: "design-ready",
  },
  {
    name: "One Drum. One Command.",
    character: "Marius Vale",
    type: "villain tee / poster / sticker",
    artwork: "False One Drum crest + purple silence pulse",
    providerFit: "Printify catalog breadth",
    status: "design-ready",
  },
  {
    name: "Noise Is Weakness",
    character: "Selah Vale",
    type: "tee / hoodie / phone case",
    artwork: "Selah baton pose + purple-black silence arc",
    providerFit: "Printful or Printify",
    status: "mockup-next",
  },
];

export const merchPipeline = [
  "Extract merch hooks from character bible and episode moments.",
  "Generate transparent PNG or print-safe flat art at provider-required resolution.",
  "Run brand/style QC against OPAIJA_STYLE_GOD_MEMORY.",
  "Create product manifest with title, description, tags, collection, price, variant strategy, and provider.",
  "Upload image to Printful/Printify adapter and generate mockups.",
  "Create draft product first; human approves before publish.",
  "Push approved product to Opaija storefront and social launch calendar.",
];

export const storeSections = [
  "Home: Opaija series signal, teaser, email capture",
  "Watch: shorts, pilot, episode archive",
  "Characters: cast pages, bibles, art reveals",
  "Shop: drops, products, collections",
  "Books: KDP comics, manga, coloring books, artbooks",
  "World: lore, Kalenda/Gayelle mythology, island map",
];

export const merchMetrics = [
  { label: "POD APIs", value: "2", detail: "Printful and Printify adapters" },
  { label: "First SKUs", value: "5", detail: "character-led launch products" },
  { label: "Approval", value: "draft", detail: "publish only after review" },
  { label: "Store", value: "domain-ready", detail: "public Opaija site lane" },
];

export const merchIcons = { Shirt, ShoppingBag, ImagePlus };
