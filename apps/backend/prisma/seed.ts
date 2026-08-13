import { PrismaClient, TruckType } from '@prisma/client'

const prisma = new PrismaClient()

const MODELS: Array<{ type: TruckType; model: string; capacities: number[] }> = [
  { type: 'open', model: '4 Tyre', capacities: [20, 30, 40] },
  { type: 'open', model: '6 Tyre', capacities: [25, 40, 30] },
  { type: 'open', model: '14-E Model', capacities: [40, 50, 60] },
  { type: 'container', model: '10 Tyre', capacities: [40, 55, 60] },
  { type: 'container', model: '12 Tyre', capacities: [25, 35, 50] },
  { type: 'container', model: '16 Tyre', capacities: [35, 50, 60] },
  { type: 'trailer', model: '8 Tyre', capacities: [25, 45, 60] },
  { type: 'trailer', model: '12 Tyre', capacities: [40, 55] },
  { type: 'trailer', model: '14 Tyre', capacities: [55, 45] },
]

const MATERIALS = [
  'Packaged Boxes',
  'Food And Agriculture',
  'Machine / Auto Parts',
  'Electronic Goods',
  'Chemical Powder',
  'Alcoholic Beverages',
  'Construction Material',
  'Petroleum / Paint',
  'Tyre',
  'Battery',
  'Cylinders',
  'Scrap',
]

async function main() {
  console.log('Seeding Wagon reference data…')

  for (const m of MODELS) {
    await prisma.truckModel.upsert({
      where: { type_model: { type: m.type, model: m.model } },
      update: { capacities: m.capacities },
      create: m,
    })
  }

  for (const name of MATERIALS) {
    const existing = await prisma.material.findFirst({ where: { name } })
    if (!existing) await prisma.material.create({ data: { name } })
  }

  // Demo accounts (fresh, no legacy migration)
  const admin = await prisma.user.upsert({
    where: { mobile: '9999988888' },
    update: {},
    create: { mobile: '9999988888', role: 'admin', name: 'Wagon Admin', verified: true, capabilities: ['transporter'] },
  })

  const supplier = await prisma.user.upsert({
    where: { mobile: '9963712337' },
    update: {},
    create: {
      mobile: '9963712337',
      role: 'supplier',
      capabilities: ['supplier'],
      name: 'Demo Supplier',
      tier: 'kyc_full',
      kycStatus: 'approved',
      verified: true,
      supplier: { create: { companyName: 'Wagon Demo Pvt Ltd', gst: 'GSTIN123', pan: 'ABCDE1234F' } },
    },
  })

  const transporter = await prisma.user.upsert({
    where: { mobile: '9491996633' },
    update: {},
    create: {
      mobile: '9491996633',
      role: 'transporter',
      capabilities: ['transporter'],
      name: 'Demo Transporter',
      tier: 'kyc_full',
      kycStatus: 'approved',
      verified: true,
      transporterVerified: true,
      transporter: {
        create: {
          pan: 'XYZDE1234F',
          bankAccount: '1234567890',
          ifsc: 'SBIN0001234',
          acctHolder: 'Demo Transporter',
        },
      },
    },
  })

  // A sample load posted by the demo supplier
  const model = await prisma.truckModel.findFirst({ where: { model: '12 Tyre', type: 'container' } })
  const material = await prisma.material.findFirst({ where: { name: 'Packaged Boxes' } })
  const supplierRow = await prisma.supplier.findUnique({ where: { userId: supplier.id } })

  if (model && material && supplierRow) {
    await prisma.load.upsert({
      where: { id: 'clx_sample_load_0001' },
      update: {},
      create: {
        id: 'clx_sample_load_0001',
        supplierId: supplierRow.id,
        pickupAddr: 'Hyderabad, Telangana',
        dropAddr: 'Vijayawada, Andhra Pradesh',
        pickupLat: 17.385044,
        pickupLng: 78.486671,
        dropLat: 16.5061743,
        dropLng: 80.6480153,
        date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        truckType: 'container',
        modelId: model.id,
        weight: 35,
        distanceKm: 250,
        materialId: material.id,
        description: 'Sample load for demo',
        noOfTrucks: 1,
        fareEstimate: 4500,
      },
    })
  }

  // Rate cards: price/km per model
  const rateModels = await prisma.truckModel.findMany()
  for (const m of rateModels) {
    await prisma.rateCard.upsert({
      where: { id: `rc_${m.id}` },
      update: {},
      create: {
        id: `rc_${m.id}`,
        modelId: m.id,
        pricePerKm: m.type === 'trailer' ? 25 : m.type === 'container' ? 20 : 15,
      },
    })
  }

  const COUNTRY_PACKS = [
    { code: 'IN', name: 'India', currency: 'INR', baseCurrency: 'INR', exchangeRateToBase: 1, language: 'en', unitSystem: 'metric', customsRegime: 'icdt', documentRequirements: ['commercial_invoice', 'packing_list', 'eway_bill', 'customs_declaration'], incotermsSupported: ['EXW', 'FOB', 'CIF', 'DAP'] },
    { code: 'AE', name: 'UAE', currency: 'AED', baseCurrency: 'INR', exchangeRateToBase: 22.7, language: 'en', unitSystem: 'metric', customsRegime: 'gcc', documentRequirements: ['commercial_invoice', 'packing_list', 'customs_declaration'], incotermsSupported: ['FOB', 'CIF', 'DAP', 'DDP'] },
    { code: 'SG', name: 'Singapore', currency: 'SGD', baseCurrency: 'INR', exchangeRateToBase: 61.5, language: 'en', unitSystem: 'metric', customsRegime: 'asean', documentRequirements: ['commercial_invoice', 'packing_list', 'customs_declaration'], incotermsSupported: ['EXW', 'FOB', 'CIF', 'DAP'] },
    { code: 'US', name: 'United States', currency: 'USD', baseCurrency: 'INR', exchangeRateToBase: 83.2, language: 'en', unitSystem: 'imperial', customsRegime: 'acp', documentRequirements: ['commercial_invoice', 'packing_list', 'bill_of_lading', 'customs_declaration'], incotermsSupported: ['EXW', 'FOB', 'CIF', 'DDP'] },
    { code: 'NL', name: 'Netherlands', currency: 'EUR', baseCurrency: 'INR', exchangeRateToBase: 90.5, language: 'nl', unitSystem: 'metric', customsRegime: 'eu', documentRequirements: ['commercial_invoice', 'packing_list', 'customs_declaration', 'certificate'], incotermsSupported: ['EXW', 'FOB', 'CIF', 'DDP'] },
    { code: 'CN', name: 'China', currency: 'CNY', baseCurrency: 'INR', exchangeRateToBase: 11.5, language: 'zh', unitSystem: 'metric', customsRegime: 'cct', documentRequirements: ['commercial_invoice', 'packing_list', 'customs_declaration'], incotermsSupported: ['FOB', 'CIF', 'DAP'] },
  ]
  for (const c of COUNTRY_PACKS) {
    await prisma.countryPack.upsert({
      where: { code: c.code },
      update: {
        currency: c.currency,
        baseCurrency: c.baseCurrency,
        exchangeRateToBase: c.exchangeRateToBase,
        language: c.language,
        unitSystem: c.unitSystem,
        customsRegime: c.customsRegime,
        documentRequirements: c.documentRequirements,
        incotermsSupported: c.incotermsSupported,
      },
      create: c,
    })
  }

  // Marketplace reference lanes (cold-start: the network needs lanes to match on).
  const SEED_LANES = [
    { originRef: 'mumbai', destinationRef: 'pune', distanceKm: 150 },
    { originRef: 'delhi', destinationRef: 'jaipur', distanceKm: 280 },
    { originRef: 'mumbai', destinationRef: 'mundra', distanceKm: 1100 },
    { originRef: 'mundra', destinationRef: 'singapore', distanceKm: 4200, mode: 'ocean' },
    { originRef: 'mumbai', destinationRef: 'dubai', distanceKm: 2100, mode: 'ocean' },
  ]
  for (const l of SEED_LANES) {
    await prisma.lane.upsert({
      where: { originRef_destinationRef_mode: { originRef: l.originRef, destinationRef: l.destinationRef, mode: l.mode ?? 'road' } },
      update: {},
      create: { originRef: l.originRef, destinationRef: l.destinationRef, distanceKm: l.distanceKm, mode: l.mode ?? 'road' },
    })
  }

  console.log('Seeding complete.')
  console.log(`  admin:        ${admin.mobile}`)
  console.log(`  supplier:     ${supplier.mobile}`)
  console.log(`  transporter:  ${transporter.mobile}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
