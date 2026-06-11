import "@/scripts/load-env" // MUST be first — populates .env.local before db client reads DATABASE_URL
import { db } from "@/lib/db/client"
import {
  brands,
  categories,
  products,
  productImages,
  productOptions,
  optionValues,
  variants,
  variantOptionValues,
} from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { uniqueSlug } from "@/lib/utils/slug"

// ─── Catalog Seed ─────────────────────────────────────────────────────────────
// D-05: realistic catalog across 3 categories with brands, variants, and images.
// Idempotent via .onConflictDoNothing() — safe to re-run.

async function seed() {
  console.log("Seeding catalog...")

  // ─── Categories (D-03) ─────────────────────────────────────────────────────
  console.log("\n  Inserting categories...")
  const categoryData = [
    { id: crypto.randomUUID(), name: "Electronics", slug: "electronics" },
    { id: crypto.randomUUID(), name: "Watches",     slug: "watches" },
    { id: crypto.randomUUID(), name: "Phones",      slug: "phones" },
  ]
  await db.insert(categories).values(categoryData).onConflictDoNothing()
  console.log(`  ✓ Categories (3)`)

  // Fetch the actual IDs from DB (may have been created in a prior run)
  const [catElectronics, catWatches, catPhones] = await Promise.all([
    db.query.categories.findFirst({ where: eq(categories.slug, "electronics") }),
    db.query.categories.findFirst({ where: eq(categories.slug, "watches") }),
    db.query.categories.findFirst({ where: eq(categories.slug, "phones") }),
  ])
  if (!catElectronics || !catWatches || !catPhones) {
    throw new Error("Categories not found after insert")
  }

  // ─── Brands (D-02) ─────────────────────────────────────────────────────────
  console.log("  Inserting brands...")
  const brandData = [
    { id: crypto.randomUUID(), name: "Samsung" },
    { id: crypto.randomUUID(), name: "Apple" },
    { id: crypto.randomUUID(), name: "Sony" },
    { id: crypto.randomUUID(), name: "Casio" },
  ]
  await db.insert(brands).values(brandData).onConflictDoNothing()
  console.log(`  ✓ Brands (4)`)

  const [brandSamsung, brandApple, brandSony, brandCasio] = await Promise.all([
    db.query.brands.findFirst({ where: eq(brands.name, "Samsung") }),
    db.query.brands.findFirst({ where: eq(brands.name, "Apple") }),
    db.query.brands.findFirst({ where: eq(brands.name, "Sony") }),
    db.query.brands.findFirst({ where: eq(brands.name, "Casio") }),
  ])
  if (!brandSamsung || !brandApple || !brandSony || !brandCasio) {
    throw new Error("Brands not found after insert")
  }

  // ─── Product helper ────────────────────────────────────────────────────────
  const slugExists = async (s: string) => {
    const row = await db.query.products.findFirst({ where: eq(products.slug, s) })
    return !!row
  }

  let productCount = 0
  let variantCount = 0
  let imageCount = 0

  // ─── Electronics Products ──────────────────────────────────────────────────
  console.log("  Inserting electronics products...")

  // Product 1: Sony WH-1000XM5 Headphones
  {
    const slug = await uniqueSlug("Sony WH-1000XM5 Headphones", slugExists)
    const existingProduct = await db.query.products.findFirst({ where: eq(products.slug, slug) })
    const productId = existingProduct?.id ?? crypto.randomUUID()

    if (!existingProduct) {
      await db.insert(products).values({
        id: productId,
        name: "Sony WH-1000XM5 Headphones",
        slug,
        description: "Industry-leading noise-canceling headphones with exceptional sound quality and up to 30 hours battery life.",
        categoryId: catElectronics.id,
        brandId: brandSony.id,
        isActive: true,
      })
    }
    productCount++

    // Images
    await db.insert(productImages).values([
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-1/800/600`, altText: "Sony WH-1000XM5 front view", position: 0, isPrimary: true },
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-2/800/600`, altText: "Sony WH-1000XM5 side view", position: 1, isPrimary: false },
    ]).onConflictDoNothing()
    imageCount += 2

    // Option: Color
    let colorOption = await db.query.productOptions.findFirst({ where: eq(productOptions.productId, productId) })
    if (!colorOption) {
      const colorOptionId = crypto.randomUUID()
      await db.insert(productOptions).values({ id: colorOptionId, productId, name: "Color", position: 0 }).onConflictDoNothing()
      colorOption = await db.query.productOptions.findFirst({ where: eq(productOptions.id, colorOptionId) })
    }
    if (!colorOption) throw new Error("Color option not found")

    const colorValues = ["Black", "Silver"]
    const colorValueIds: string[] = []
    for (let i = 0; i < colorValues.length; i++) {
      let ov = await db.query.optionValues.findFirst({
        where: (t, { and, eq: eqFn }) => and(eqFn(t.productOptionId, colorOption!.id), eqFn(t.value, colorValues[i]!))
      })
      if (!ov) {
        const ovId = crypto.randomUUID()
        await db.insert(optionValues).values({ id: ovId, productOptionId: colorOption.id, value: colorValues[i]!, position: i }).onConflictDoNothing()
        ov = await db.query.optionValues.findFirst({ where: eq(optionValues.id, ovId) })
      }
      if (!ov) throw new Error(`OptionValue not found: ${colorValues[i]}`)
      colorValueIds.push(ov.id)
    }

    // Variants: Black (in stock), Silver (low stock)
    const xm5Variants = [
      { sku: "SONY-WH1000XM5-BLK", priceKobo: 18000000, stock: 15, colorIdx: 0 }, // ₦180,000
      { sku: "SONY-WH1000XM5-SLV", priceKobo: 18000000, stock: 3,  colorIdx: 1 }, // ₦180,000 (low stock)
    ]
    for (const v of xm5Variants) {
      let variant = await db.query.variants.findFirst({ where: eq(variants.sku, v.sku) })
      if (!variant) {
        const variantId = crypto.randomUUID()
        await db.insert(variants).values({
          id: variantId, productId, sku: v.sku,
          priceKobo: v.priceKobo, stock: v.stock, isActive: true,
        }).onConflictDoNothing()
        variant = await db.query.variants.findFirst({ where: eq(variants.id, variantId) })
        if (!variant) throw new Error(`Variant not found: ${v.sku}`)
        await db.insert(variantOptionValues).values({
          variantId: variant.id, optionValueId: colorValueIds[v.colorIdx]!
        }).onConflictDoNothing()
        variantCount++
      }
    }
  }

  // Product 2: Samsung Galaxy Tab S10
  {
    const slug = await uniqueSlug("Samsung Galaxy Tab S10", slugExists)
    const existingProduct = await db.query.products.findFirst({ where: eq(products.slug, slug) })
    const productId = existingProduct?.id ?? crypto.randomUUID()

    if (!existingProduct) {
      await db.insert(products).values({
        id: productId,
        name: "Samsung Galaxy Tab S10",
        slug,
        description: "Premium Android tablet with a stunning 11-inch Dynamic AMOLED display, S Pen included.",
        categoryId: catElectronics.id,
        brandId: brandSamsung.id,
        isActive: true,
      })
    }
    productCount++

    await db.insert(productImages).values([
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-1/800/600`, altText: "Samsung Galaxy Tab S10 front", position: 0, isPrimary: true },
    ]).onConflictDoNothing()
    imageCount += 1

    // Option: Storage
    let storageOption = await db.query.productOptions.findFirst({ where: eq(productOptions.productId, productId) })
    if (!storageOption) {
      const storageOptionId = crypto.randomUUID()
      await db.insert(productOptions).values({ id: storageOptionId, productId, name: "Storage", position: 0 }).onConflictDoNothing()
      storageOption = await db.query.productOptions.findFirst({ where: eq(productOptions.id, storageOptionId) })
    }
    if (!storageOption) throw new Error("Storage option not found")

    const storageValues = ["128GB", "256GB"]
    const storageValueIds: string[] = []
    for (let i = 0; i < storageValues.length; i++) {
      let ov = await db.query.optionValues.findFirst({
        where: (t, { and, eq: eqFn }) => and(eqFn(t.productOptionId, storageOption!.id), eqFn(t.value, storageValues[i]!))
      })
      if (!ov) {
        const ovId = crypto.randomUUID()
        await db.insert(optionValues).values({ id: ovId, productOptionId: storageOption.id, value: storageValues[i]!, position: i }).onConflictDoNothing()
        ov = await db.query.optionValues.findFirst({ where: eq(optionValues.id, ovId) })
      }
      if (!ov) throw new Error(`OptionValue not found: ${storageValues[i]}`)
      storageValueIds.push(ov.id)
    }

    const tabVariants = [
      { sku: "SAM-TAB-S10-128", priceKobo: 45000000, stock: 8,  storageIdx: 0 }, // ₦450,000
      { sku: "SAM-TAB-S10-256", priceKobo: 55000000, stock: 0,  storageIdx: 1 }, // ₦550,000 (OOS)
    ]
    for (const v of tabVariants) {
      let variant = await db.query.variants.findFirst({ where: eq(variants.sku, v.sku) })
      if (!variant) {
        const variantId = crypto.randomUUID()
        await db.insert(variants).values({
          id: variantId, productId, sku: v.sku,
          priceKobo: v.priceKobo, stock: v.stock, isActive: true,
        }).onConflictDoNothing()
        variant = await db.query.variants.findFirst({ where: eq(variants.id, variantId) })
        if (!variant) throw new Error(`Variant not found: ${v.sku}`)
        await db.insert(variantOptionValues).values({
          variantId: variant.id, optionValueId: storageValueIds[v.storageIdx]!
        }).onConflictDoNothing()
        variantCount++
      }
    }
  }

  // ─── Watches Products ──────────────────────────────────────────────────────
  console.log("  Inserting watches products...")

  // Product 3: Casio G-Shock GA-2100
  {
    const slug = await uniqueSlug("Casio G-Shock GA-2100", slugExists)
    const existingProduct = await db.query.products.findFirst({ where: eq(products.slug, slug) })
    const productId = existingProduct?.id ?? crypto.randomUUID()

    if (!existingProduct) {
      await db.insert(products).values({
        id: productId,
        name: "Casio G-Shock GA-2100",
        slug,
        description: "CasiOak with carbon-core guard structure, 200M water resistance, and ultra-slim design.",
        categoryId: catWatches.id,
        brandId: brandCasio.id,
        isActive: true,
      })
    }
    productCount++

    await db.insert(productImages).values([
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-1/800/600`, altText: "Casio G-Shock GA-2100 black", position: 0, isPrimary: true },
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-2/800/600`, altText: "Casio G-Shock GA-2100 detail", position: 1, isPrimary: false },
    ]).onConflictDoNothing()
    imageCount += 2

    // Option: Color
    let colorOption = await db.query.productOptions.findFirst({ where: eq(productOptions.productId, productId) })
    if (!colorOption) {
      const colorOptionId = crypto.randomUUID()
      await db.insert(productOptions).values({ id: colorOptionId, productId, name: "Color", position: 0 }).onConflictDoNothing()
      colorOption = await db.query.productOptions.findFirst({ where: eq(productOptions.id, colorOptionId) })
    }
    if (!colorOption) throw new Error("Color option not found")

    const colorValues = ["Black", "White", "Blue"]
    const colorValueIds: string[] = []
    for (let i = 0; i < colorValues.length; i++) {
      let ov = await db.query.optionValues.findFirst({
        where: (t, { and, eq: eqFn }) => and(eqFn(t.productOptionId, colorOption!.id), eqFn(t.value, colorValues[i]!))
      })
      if (!ov) {
        const ovId = crypto.randomUUID()
        await db.insert(optionValues).values({ id: ovId, productOptionId: colorOption.id, value: colorValues[i]!, position: i }).onConflictDoNothing()
        ov = await db.query.optionValues.findFirst({ where: eq(optionValues.id, ovId) })
      }
      if (!ov) throw new Error(`OptionValue not found: ${colorValues[i]}`)
      colorValueIds.push(ov.id)
    }

    const gshockVariants = [
      { sku: "CASIO-GA2100-BLK", priceKobo: 7500000, stock: 20, colorIdx: 0 }, // ₦75,000
      { sku: "CASIO-GA2100-WHT", priceKobo: 7500000, stock: 4,  colorIdx: 1 }, // ₦75,000 (low stock)
      { sku: "CASIO-GA2100-BLU", priceKobo: 7800000, stock: 0,  colorIdx: 2 }, // ₦78,000 (OOS)
    ]
    for (const v of gshockVariants) {
      let variant = await db.query.variants.findFirst({ where: eq(variants.sku, v.sku) })
      if (!variant) {
        const variantId = crypto.randomUUID()
        await db.insert(variants).values({
          id: variantId, productId, sku: v.sku,
          priceKobo: v.priceKobo, stock: v.stock, isActive: true,
        }).onConflictDoNothing()
        variant = await db.query.variants.findFirst({ where: eq(variants.id, variantId) })
        if (!variant) throw new Error(`Variant not found: ${v.sku}`)
        await db.insert(variantOptionValues).values({
          variantId: variant.id, optionValueId: colorValueIds[v.colorIdx]!
        }).onConflictDoNothing()
        variantCount++
      }
    }
  }

  // Product 4: Apple Watch Series 10
  {
    const slug = await uniqueSlug("Apple Watch Series 10", slugExists)
    const existingProduct = await db.query.products.findFirst({ where: eq(products.slug, slug) })
    const productId = existingProduct?.id ?? crypto.randomUUID()

    if (!existingProduct) {
      await db.insert(products).values({
        id: productId,
        name: "Apple Watch Series 10",
        slug,
        description: "The thinnest Apple Watch ever with a stunning 46mm display, advanced health features, and all-day battery.",
        categoryId: catWatches.id,
        brandId: brandApple.id,
        isActive: true,
      })
    }
    productCount++

    await db.insert(productImages).values([
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-1/800/600`, altText: "Apple Watch Series 10 midnight", position: 0, isPrimary: true },
    ]).onConflictDoNothing()
    imageCount += 1

    // Options: Color + Size
    let colorOption = await db.query.productOptions.findFirst({
      where: (t, { and, eq: eqFn }) => and(eqFn(t.productId, productId), eqFn(t.name, "Color"))
    })
    if (!colorOption) {
      const colorOptionId = crypto.randomUUID()
      await db.insert(productOptions).values({ id: colorOptionId, productId, name: "Color", position: 0 }).onConflictDoNothing()
      colorOption = await db.query.productOptions.findFirst({ where: eq(productOptions.id, colorOptionId) })
    }
    if (!colorOption) throw new Error("Color option not found")

    let sizeOption = await db.query.productOptions.findFirst({
      where: (t, { and, eq: eqFn }) => and(eqFn(t.productId, productId), eqFn(t.name, "Size"))
    })
    if (!sizeOption) {
      const sizeOptionId = crypto.randomUUID()
      await db.insert(productOptions).values({ id: sizeOptionId, productId, name: "Size", position: 1 }).onConflictDoNothing()
      sizeOption = await db.query.productOptions.findFirst({ where: eq(productOptions.id, sizeOptionId) })
    }
    if (!sizeOption) throw new Error("Size option not found")

    // Color values
    const colorDefs = ["Midnight", "Starlight"]
    const colorValueIds: string[] = []
    for (let i = 0; i < colorDefs.length; i++) {
      let ov = await db.query.optionValues.findFirst({
        where: (t, { and, eq: eqFn }) => and(eqFn(t.productOptionId, colorOption!.id), eqFn(t.value, colorDefs[i]!))
      })
      if (!ov) {
        const ovId = crypto.randomUUID()
        await db.insert(optionValues).values({ id: ovId, productOptionId: colorOption.id, value: colorDefs[i]!, position: i }).onConflictDoNothing()
        ov = await db.query.optionValues.findFirst({ where: eq(optionValues.id, ovId) })
      }
      if (!ov) throw new Error(`OptionValue not found: ${colorDefs[i]}`)
      colorValueIds.push(ov.id)
    }

    // Size values
    const sizeDefs = ["42mm", "46mm"]
    const sizeValueIds: string[] = []
    for (let i = 0; i < sizeDefs.length; i++) {
      let ov = await db.query.optionValues.findFirst({
        where: (t, { and, eq: eqFn }) => and(eqFn(t.productOptionId, sizeOption!.id), eqFn(t.value, sizeDefs[i]!))
      })
      if (!ov) {
        const ovId = crypto.randomUUID()
        await db.insert(optionValues).values({ id: ovId, productOptionId: sizeOption.id, value: sizeDefs[i]!, position: i }).onConflictDoNothing()
        ov = await db.query.optionValues.findFirst({ where: eq(optionValues.id, ovId) })
      }
      if (!ov) throw new Error(`OptionValue not found: ${sizeDefs[i]}`)
      sizeValueIds.push(ov.id)
    }

    // Variants: 2 colors × 2 sizes = 4 variants
    const awVariants = [
      { sku: "APPLE-W10-42-MID", priceKobo: 65000000, stock: 12, colorIdx: 0, sizeIdx: 0 }, // ₦650,000
      { sku: "APPLE-W10-46-MID", priceKobo: 70000000, stock: 5,  colorIdx: 0, sizeIdx: 1 }, // ₦700,000 (low stock)
      { sku: "APPLE-W10-42-STL", priceKobo: 65000000, stock: 8,  colorIdx: 1, sizeIdx: 0 }, // ₦650,000
      { sku: "APPLE-W10-46-STL", priceKobo: 70000000, stock: 0,  colorIdx: 1, sizeIdx: 1 }, // ₦700,000 (OOS)
    ]
    for (const v of awVariants) {
      let variant = await db.query.variants.findFirst({ where: eq(variants.sku, v.sku) })
      if (!variant) {
        const variantId = crypto.randomUUID()
        await db.insert(variants).values({
          id: variantId, productId, sku: v.sku,
          priceKobo: v.priceKobo, stock: v.stock, isActive: true,
        }).onConflictDoNothing()
        variant = await db.query.variants.findFirst({ where: eq(variants.id, variantId) })
        if (!variant) throw new Error(`Variant not found: ${v.sku}`)
        await db.insert(variantOptionValues).values([
          { variantId: variant.id, optionValueId: colorValueIds[v.colorIdx]! },
          { variantId: variant.id, optionValueId: sizeValueIds[v.sizeIdx]! },
        ]).onConflictDoNothing()
        variantCount++
      }
    }
  }

  // ─── Phones Products ───────────────────────────────────────────────────────
  console.log("  Inserting phones products...")

  // Product 5: Samsung Galaxy S25 Ultra
  {
    const slug = await uniqueSlug("Samsung Galaxy S25 Ultra", slugExists)
    const existingProduct = await db.query.products.findFirst({ where: eq(products.slug, slug) })
    const productId = existingProduct?.id ?? crypto.randomUUID()

    if (!existingProduct) {
      await db.insert(products).values({
        id: productId,
        name: "Samsung Galaxy S25 Ultra",
        slug,
        description: "The ultimate Samsung flagship with Snapdragon 8 Elite, titanium frame, and built-in S Pen for precision productivity.",
        categoryId: catPhones.id,
        brandId: brandSamsung.id,
        isActive: true,
      })
    }
    productCount++

    await db.insert(productImages).values([
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-1/800/600`, altText: "Samsung Galaxy S25 Ultra titanium black", position: 0, isPrimary: true },
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-2/800/600`, altText: "Samsung Galaxy S25 Ultra S Pen detail", position: 1, isPrimary: false },
    ]).onConflictDoNothing()
    imageCount += 2

    // Options: Color + Storage
    let colorOption = await db.query.productOptions.findFirst({
      where: (t, { and, eq: eqFn }) => and(eqFn(t.productId, productId), eqFn(t.name, "Color"))
    })
    if (!colorOption) {
      const colorOptionId = crypto.randomUUID()
      await db.insert(productOptions).values({ id: colorOptionId, productId, name: "Color", position: 0 }).onConflictDoNothing()
      colorOption = await db.query.productOptions.findFirst({ where: eq(productOptions.id, colorOptionId) })
    }
    if (!colorOption) throw new Error("Color option not found")

    let storageOption = await db.query.productOptions.findFirst({
      where: (t, { and, eq: eqFn }) => and(eqFn(t.productId, productId), eqFn(t.name, "Storage"))
    })
    if (!storageOption) {
      const storageOptionId = crypto.randomUUID()
      await db.insert(productOptions).values({ id: storageOptionId, productId, name: "Storage", position: 1 }).onConflictDoNothing()
      storageOption = await db.query.productOptions.findFirst({ where: eq(productOptions.id, storageOptionId) })
    }
    if (!storageOption) throw new Error("Storage option not found")

    const colorDefs = ["Titanium Black", "Titanium Silver"]
    const colorValueIds: string[] = []
    for (let i = 0; i < colorDefs.length; i++) {
      let ov = await db.query.optionValues.findFirst({
        where: (t, { and, eq: eqFn }) => and(eqFn(t.productOptionId, colorOption!.id), eqFn(t.value, colorDefs[i]!))
      })
      if (!ov) {
        const ovId = crypto.randomUUID()
        await db.insert(optionValues).values({ id: ovId, productOptionId: colorOption.id, value: colorDefs[i]!, position: i }).onConflictDoNothing()
        ov = await db.query.optionValues.findFirst({ where: eq(optionValues.id, ovId) })
      }
      if (!ov) throw new Error(`OptionValue not found: ${colorDefs[i]}`)
      colorValueIds.push(ov.id)
    }

    const storageDefs = ["256GB", "512GB", "1TB"]
    const storageValueIds: string[] = []
    for (let i = 0; i < storageDefs.length; i++) {
      let ov = await db.query.optionValues.findFirst({
        where: (t, { and, eq: eqFn }) => and(eqFn(t.productOptionId, storageOption!.id), eqFn(t.value, storageDefs[i]!))
      })
      if (!ov) {
        const ovId = crypto.randomUUID()
        await db.insert(optionValues).values({ id: ovId, productOptionId: storageOption.id, value: storageDefs[i]!, position: i }).onConflictDoNothing()
        ov = await db.query.optionValues.findFirst({ where: eq(optionValues.id, ovId) })
      }
      if (!ov) throw new Error(`OptionValue not found: ${storageDefs[i]}`)
      storageValueIds.push(ov.id)
    }

    // 2 colors × 3 storage = 6 variants
    const s25Variants = [
      { sku: "SAM-S25U-BLK-256", priceKobo: 120000000, stock: 10, colorIdx: 0, storageIdx: 0 }, // ₦1,200,000
      { sku: "SAM-S25U-BLK-512", priceKobo: 135000000, stock: 7,  colorIdx: 0, storageIdx: 1 }, // ₦1,350,000
      { sku: "SAM-S25U-BLK-1TB", priceKobo: 155000000, stock: 2,  colorIdx: 0, storageIdx: 2 }, // ₦1,550,000 (low stock)
      { sku: "SAM-S25U-SLV-256", priceKobo: 120000000, stock: 8,  colorIdx: 1, storageIdx: 0 }, // ₦1,200,000
      { sku: "SAM-S25U-SLV-512", priceKobo: 135000000, stock: 4,  colorIdx: 1, storageIdx: 1 }, // ₦1,350,000 (low stock)
      { sku: "SAM-S25U-SLV-1TB", priceKobo: 155000000, stock: 0,  colorIdx: 1, storageIdx: 2 }, // ₦1,550,000 (OOS)
    ]
    for (const v of s25Variants) {
      let variant = await db.query.variants.findFirst({ where: eq(variants.sku, v.sku) })
      if (!variant) {
        const variantId = crypto.randomUUID()
        await db.insert(variants).values({
          id: variantId, productId, sku: v.sku,
          priceKobo: v.priceKobo, stock: v.stock, isActive: true,
        }).onConflictDoNothing()
        variant = await db.query.variants.findFirst({ where: eq(variants.id, variantId) })
        if (!variant) throw new Error(`Variant not found: ${v.sku}`)
        await db.insert(variantOptionValues).values([
          { variantId: variant.id, optionValueId: colorValueIds[v.colorIdx]! },
          { variantId: variant.id, optionValueId: storageValueIds[v.storageIdx]! },
        ]).onConflictDoNothing()
        variantCount++
      }
    }
  }

  // Product 6: Apple iPhone 16 Pro
  {
    const slug = await uniqueSlug("Apple iPhone 16 Pro", slugExists)
    const existingProduct = await db.query.products.findFirst({ where: eq(products.slug, slug) })
    const productId = existingProduct?.id ?? crypto.randomUUID()

    if (!existingProduct) {
      await db.insert(products).values({
        id: productId,
        name: "Apple iPhone 16 Pro",
        slug,
        description: "Apple Intelligence on iPhone. A18 Pro chip, 48MP Fusion Camera, titanium design, and a new Camera Control button.",
        categoryId: catPhones.id,
        brandId: brandApple.id,
        isActive: true,
      })
    }
    productCount++

    await db.insert(productImages).values([
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-1/800/600`, altText: "Apple iPhone 16 Pro desert titanium", position: 0, isPrimary: true },
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-2/800/600`, altText: "Apple iPhone 16 Pro camera system", position: 1, isPrimary: false },
      { id: crypto.randomUUID(), productId, url: `https://picsum.photos/seed/${slug}-3/800/600`, altText: "Apple iPhone 16 Pro side view", position: 2, isPrimary: false },
    ]).onConflictDoNothing()
    imageCount += 3

    // Options: Color + Storage
    let colorOption = await db.query.productOptions.findFirst({
      where: (t, { and, eq: eqFn }) => and(eqFn(t.productId, productId), eqFn(t.name, "Color"))
    })
    if (!colorOption) {
      const colorOptionId = crypto.randomUUID()
      await db.insert(productOptions).values({ id: colorOptionId, productId, name: "Color", position: 0 }).onConflictDoNothing()
      colorOption = await db.query.productOptions.findFirst({ where: eq(productOptions.id, colorOptionId) })
    }
    if (!colorOption) throw new Error("Color option not found")

    let storageOption = await db.query.productOptions.findFirst({
      where: (t, { and, eq: eqFn }) => and(eqFn(t.productId, productId), eqFn(t.name, "Storage"))
    })
    if (!storageOption) {
      const storageOptionId = crypto.randomUUID()
      await db.insert(productOptions).values({ id: storageOptionId, productId, name: "Storage", position: 1 }).onConflictDoNothing()
      storageOption = await db.query.productOptions.findFirst({ where: eq(productOptions.id, storageOptionId) })
    }
    if (!storageOption) throw new Error("Storage option not found")

    const colorDefs = ["Desert Titanium", "Black Titanium", "White Titanium"]
    const colorValueIds: string[] = []
    for (let i = 0; i < colorDefs.length; i++) {
      let ov = await db.query.optionValues.findFirst({
        where: (t, { and, eq: eqFn }) => and(eqFn(t.productOptionId, colorOption!.id), eqFn(t.value, colorDefs[i]!))
      })
      if (!ov) {
        const ovId = crypto.randomUUID()
        await db.insert(optionValues).values({ id: ovId, productOptionId: colorOption.id, value: colorDefs[i]!, position: i }).onConflictDoNothing()
        ov = await db.query.optionValues.findFirst({ where: eq(optionValues.id, ovId) })
      }
      if (!ov) throw new Error(`OptionValue not found: ${colorDefs[i]}`)
      colorValueIds.push(ov.id)
    }

    const storageDefs = ["128GB", "256GB", "512GB", "1TB"]
    const storageValueIds: string[] = []
    for (let i = 0; i < storageDefs.length; i++) {
      let ov = await db.query.optionValues.findFirst({
        where: (t, { and, eq: eqFn }) => and(eqFn(t.productOptionId, storageOption!.id), eqFn(t.value, storageDefs[i]!))
      })
      if (!ov) {
        const ovId = crypto.randomUUID()
        await db.insert(optionValues).values({ id: ovId, productOptionId: storageOption.id, value: storageDefs[i]!, position: i }).onConflictDoNothing()
        ov = await db.query.optionValues.findFirst({ where: eq(optionValues.id, ovId) })
      }
      if (!ov) throw new Error(`OptionValue not found: ${storageDefs[i]}`)
      storageValueIds.push(ov.id)
    }

    // 3 colors × 4 storage = 12 variants
    const ip16Variants = [
      { sku: "APPLE-IP16P-DST-128", priceKobo: 130000000, stock: 15, colorIdx: 0, storageIdx: 0 },  // ₦1,300,000
      { sku: "APPLE-IP16P-DST-256", priceKobo: 145000000, stock: 8,  colorIdx: 0, storageIdx: 1 },  // ₦1,450,000
      { sku: "APPLE-IP16P-DST-512", priceKobo: 165000000, stock: 3,  colorIdx: 0, storageIdx: 2 },  // low stock
      { sku: "APPLE-IP16P-DST-1TB", priceKobo: 190000000, stock: 0,  colorIdx: 0, storageIdx: 3 },  // OOS
      { sku: "APPLE-IP16P-BLK-128", priceKobo: 130000000, stock: 20, colorIdx: 1, storageIdx: 0 },  // ₦1,300,000
      { sku: "APPLE-IP16P-BLK-256", priceKobo: 145000000, stock: 12, colorIdx: 1, storageIdx: 1 },  // ₦1,450,000
      { sku: "APPLE-IP16P-BLK-512", priceKobo: 165000000, stock: 5,  colorIdx: 1, storageIdx: 2 },  // low stock (=threshold)
      { sku: "APPLE-IP16P-BLK-1TB", priceKobo: 190000000, stock: 1,  colorIdx: 1, storageIdx: 3 },  // low stock
      { sku: "APPLE-IP16P-WHT-128", priceKobo: 130000000, stock: 18, colorIdx: 2, storageIdx: 0 },  // ₦1,300,000
      { sku: "APPLE-IP16P-WHT-256", priceKobo: 145000000, stock: 6,  colorIdx: 2, storageIdx: 1 },  // ₦1,450,000
      { sku: "APPLE-IP16P-WHT-512", priceKobo: 165000000, stock: 4,  colorIdx: 2, storageIdx: 2 },  // low stock
      { sku: "APPLE-IP16P-WHT-1TB", priceKobo: 190000000, stock: 0,  colorIdx: 2, storageIdx: 3 },  // OOS
    ]
    for (const v of ip16Variants) {
      let variant = await db.query.variants.findFirst({ where: eq(variants.sku, v.sku) })
      if (!variant) {
        const variantId = crypto.randomUUID()
        await db.insert(variants).values({
          id: variantId, productId, sku: v.sku,
          priceKobo: v.priceKobo, stock: v.stock, isActive: true,
        }).onConflictDoNothing()
        variant = await db.query.variants.findFirst({ where: eq(variants.id, variantId) })
        if (!variant) throw new Error(`Variant not found: ${v.sku}`)
        await db.insert(variantOptionValues).values([
          { variantId: variant.id, optionValueId: colorValueIds[v.colorIdx]! },
          { variantId: variant.id, optionValueId: storageValueIds[v.storageIdx]! },
        ]).onConflictDoNothing()
        variantCount++
      }
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log("\nCatalog seed complete.")
  console.log(`  ✓ ${productCount} products (across 3 categories)`)
  console.log(`  ✓ ${variantCount} variants (priceKobo + stock)`)
  console.log(`  ✓ ${imageCount} product images`)
  console.log("  ✓ 4 brands")
  console.log("  ✓ 3 categories (Electronics, Watches, Phones)")
}

// ─── Entry point ──────────────────────────────────────────────────────────────

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Catalog seed failed:", err)
    process.exit(1)
  })
