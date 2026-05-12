# OPAIJA Merch and Storefront Pipeline

## Decision

Build a provider-agnostic print-on-demand pipeline with Printful and Printify adapters. Use draft products first, then approve mockups before publishing.

## Providers

Printful and Printify both have APIs suitable for product automation.

Shared environment variables:

```powershell
MERCH_PROVIDER=mock
PRINTFUL_API_KEY=
PRINTFUL_STORE_ID=
PRINTIFY_API_KEY=
PRINTIFY_SHOP_ID=
```

## Pipeline

1. Pull merch hooks from character bibles and episodes.
2. Generate transparent PNG artwork or print-safe flat art.
3. Run style QC against `OPAIJA_STYLE_GOD_MEMORY`.
4. Create product manifest: title, description, tags, collection, price, variant plan.
5. Upload artwork to Printful or Printify.
6. Generate mockups.
7. Create draft product.
8. Human approves.
9. Publish to the Opaija store and social launch calendar.

## Storefront

Build the public Opaija domain as a real series website, not just a shop:

- Home: teaser, email capture, launch signal
- Watch: shorts, pilot, episode archive
- Characters: cast pages and art reveals
- Shop: print-on-demand collections
- Books: comics, manga, coloring books, artbooks
- World: lore, island map, Kalenda/Gayelle mythology

## First Drops

- Mother Lall: `Eat First. Panic After.`
- Jabari: `Hold Beat! Hold Beat!`
- Tariq: `The Tide Teaches Patience`
- Malik: `Break the Beat. Build the Legacy.`
- Opaija core mark collection
