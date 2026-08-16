import { useEffect, useState } from 'react'
import { TextInput, Pressable, Text, View, Alert } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Wizard, Field } from '@wagon/components'
import { api } from '../config'
import type { Material, TruckModel } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface Props {
  onComplete: () => void
  onCancel: () => void
}

// Condensed: 6 quick steps instead of 12.
const getSteps = (t: (key: string) => string) => [
  { key: 'route', label: t('postLoad.stepRoute') },
  { key: 'cargo', label: t('postLoad.stepCargo') },
  { key: 'truck', label: t('postLoad.stepTruck') },
  { key: 'schedule', label: t('postLoad.stepWhen') },
  { key: 'commercial', label: t('postLoad.stepPricing') },
  { key: 'publish', label: t('postLoad.stepPublish') },
]

const getCommercialModels = (t: (key: string) => string) => [
  { key: 'fixed_rate', label: t('postLoad.modelFixed'), desc: t('postLoad.modelFixedDesc') },
  { key: 'open_bidding', label: t('postLoad.modelOpen'), desc: t('postLoad.modelOpenDesc') },
  { key: 'invite', label: t('postLoad.modelInvite'), desc: t('postLoad.modelInviteDesc') },
]

const MATERIAL_OPTIONS = ['Packaged Boxes', 'Food And Agriculture', 'Construction Material', 'Tyre', 'Scrap', 'Electronic Goods', 'Chemical Powder', 'Other']
const TRUCK_TYPES = ['open', 'container', 'trailer']
const BODY_TYPES = ['Open body', 'Covered', 'Container', 'Flatbed']
const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: '2d', label: 'In 2 days' },
  { key: 'week', label: 'This week' },
]

function isoDaysFromNow(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function PostLoadWizard({ onComplete, onCancel }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const steps = getSteps(t)
  const commercialModels = getCommercialModels(t)
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const [models, setModels] = useState<TruckModel[]>([])
  const [materials, setMaterials] = useState<Material[]>([])

  const [pickup, setPickup] = useState('')
  const [drop, setDrop] = useState('')
  const [weight, setWeight] = useState('')
  const [distance, setDistance] = useState('')
  const [material, setMaterial] = useState('')
  const [bodyType, setBodyType] = useState('Open body')
  const [truckType, setTruckType] = useState('container')
  const [modelId, setModelId] = useState('')
  const [pickupDate, setPickupDate] = useState(isoDaysFromNow(1))
  const [dropDate, setDropDate] = useState('')
  const [loadingReq, setLoadingReq] = useState('')
  const [specialReq, setSpecialReq] = useState('')
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [payLater, setPayLater] = useState(false)
  const [commercialModel, setCommercialModel] = useState('fixed_rate')
  const [referenceRate, setReferenceRate] = useState('')
  const [advancePct, setAdvancePct] = useState('')

  useEffect(() => {
    api.get<{ models: TruckModel[]; materials: Material[] }>('/reference').then((res) => {
      setModels(res.models)
      setMaterials(res.materials)
      setMaterial(res.materials[0]?.name ?? '')
      setModelId(res.models.find((m) => m.type === 'container')?.id ?? res.models[0]?.id ?? '')
    }).catch(() => {})
  }, [])

  const inputStyle = {
    backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground,
    borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15,
  }

  const typeModels = models.filter((m) => m.type === truckType)
  const modelName = typeModels.find((m) => m.id === modelId)?.model ?? ''

  const canNext =
    step === 0 ? !!pickup.trim() && !!drop.trim()
    : step === 1 ? !!weight.trim() && !!material
    : step === 2 ? !!truckType && !!modelId
    : step === 3 ? !!pickupDate
    : step === 4 ? !!commercialModel
    : true

  const submit = async () => {
    setSubmitting(true)
    try {
      // Geocode pickup/drop to real coordinates; compute distance from the route.
      // Never publish with wrong coordinates — block if geocoding fails.
      let pickupLat: number | null = null, pickupLng: number | null = null, dropLat: number | null = null, dropLng: number | null = null
      let distanceKm = Number(distance)
      const [gPick, gDrop] = await Promise.all([
        api.get<{ found: boolean; coords: [number, number] | null }>(`/reference/geocode?q=${encodeURIComponent(pickup)}`),
        api.get<{ found: boolean; coords: [number, number] | null }>(`/reference/geocode?q=${encodeURIComponent(drop)}`),
      ])
      if (!gPick.found || !gPick.coords || !gDrop.found || !gDrop.coords) {
        const missing = [gPick.found ? null : 'pickup', gDrop.found ? null : 'drop'].filter(Boolean).join(' and ')
        throw new Error(`Could not geocode the ${missing} address. Please use a more specific place name.`)
      }
      pickupLat = gPick.coords[0]; pickupLng = gPick.coords[1]
      dropLat = gDrop.coords[0]; dropLng = gDrop.coords[1]
      if (!distanceKm || distanceKm <= 0) {
        const dist = await api.get<{ found: boolean; distanceKm: number | null }>(`/reference/distance?from=${encodeURIComponent(pickup)}&to=${encodeURIComponent(drop)}`)
        if (dist.found && dist.distanceKm) distanceKm = dist.distanceKm
      }
      if (!distanceKm || distanceKm <= 0) {
        throw new Error('Could not estimate the route distance — please enter it manually')
      }

      await api.post('/loads', {
        pickupAddr: pickup,
        dropAddr: drop,
        pickupLat, pickupLng, dropLat, dropLng,
        date: new Date(pickupDate).toISOString(),
        pickupDate: new Date(pickupDate).toISOString(),
        dropDate: dropDate ? new Date(dropDate).toISOString() : undefined,
        truckType,
        modelId,
        weight: Number(weight),
        distanceKm,
        // Resolve the material explicitly — never silently fall back to the first
        // material (which would publish the wrong cargo type on the load).
        materialId: (() => {
          if (material === 'Other') return materials[0]?.id
          const match = materials.find((m) => m.name === material)
          if (!match) throw new Error('Selected material is not available — pick another')
          return match.id
        })(),
        bodyType,
        loadingReq: loadingReq || undefined,
        specialReq: specialReq || undefined,
        advanceAmount: advanceAmount ? Number(advanceAmount) : undefined,
        payLater,
        commercialModel,
        referenceRate: referenceRate ? Number(referenceRate) : undefined,
        advancePct: advancePct ? Number(advancePct) : undefined,
      })
      onComplete()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to publish')
    } finally { setSubmitting(false) }
  }

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1)
    else submit()
  }

  return (
    <Wizard
      title={t('postLoad.title')}
      steps={steps}
      step={step}
      onNext={next}
      onBackStep={() => (step > 0 ? setStep(step - 1) : onCancel())}
      onSkip={onCancel}
      canNext={canNext}
      submitting={submitting}
      nextLabel={step === steps.length - 1 ? t('postLoad.publishLoad') : t('common.continue')}
    >
      {step === 0 && (
        <>
          <Field label={t('postLoad.whereFrom')}>
            <TextInput style={inputStyle} value={pickup} onChangeText={setPickup} placeholder={t('postLoad.fromExample')} placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
          <Field label={t('postLoad.whereTo')}>
            <TextInput style={inputStyle} value={drop} onChangeText={setDrop} placeholder={t('postLoad.toExample')} placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
          <Field label={t('postLoad.distance')}>
            <TextInput style={inputStyle} value={distance} onChangeText={setDistance} placeholder={t('postLoad.distanceExample')} keyboardType="decimal-pad" placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
        </>
      )}

      {step === 1 && (
        <>
          <Field label={t('postLoad.shipping')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {MATERIAL_OPTIONS.map((m) => (
                <Pressable key={m} onPress={() => setMaterial(m)} style={{ borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: material === m ? theme.primary : theme.background, borderColor: material === m ? theme.primary : theme.border }}>
                  <Text style={{ color: material === m ? '#fff' : theme.mutedForeground, fontSize: 12, fontWeight: '600' }}>{m}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label={t('postLoad.weight')}>
            <TextInput style={inputStyle} value={weight} onChangeText={setWeight} placeholder={t('postLoad.weightExample')} keyboardType="decimal-pad" placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          <Field label={t('postLoad.truckType')}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {TRUCK_TYPES.map((t) => (
                <Pressable key={t} onPress={() => { setTruckType(t); setModelId(models.find((m) => m.type === t)?.id ?? modelId) }} style={{ borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: truckType === t ? theme.primary : theme.background, borderColor: truckType === t ? theme.primary : theme.border }}>
                  <Text style={{ color: truckType === t ? '#fff' : theme.mutedForeground, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label={t('postLoad.truckSize')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {typeModels.map((m) => (
                <Pressable key={m.id} onPress={() => setModelId(m.id)} style={{ borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: modelId === m.id ? theme.primary : theme.background, borderColor: modelId === m.id ? theme.primary : theme.border }}>
                  <Text style={{ color: modelId === m.id ? '#fff' : theme.mutedForeground, fontSize: 12, fontWeight: '600' }}>{m.model}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label={t('postLoad.bodyType')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {BODY_TYPES.map((b) => (
                <Pressable key={b} onPress={() => setBodyType(b)} style={{ borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: bodyType === b ? theme.primary : theme.background, borderColor: bodyType === b ? theme.primary : theme.border }}>
                  <Text style={{ color: bodyType === b ? '#fff' : theme.mutedForeground, fontSize: 12, fontWeight: '600' }}>{b}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
        </>
      )}

      {step === 3 && (
        <>
          <Field label={t('postLoad.pickupDate')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {DATE_PRESETS.map((p) => {
                const date = isoDaysFromNow(p.key === 'today' ? 0 : p.key === 'tomorrow' ? 1 : p.key === '2d' ? 2 : 7)
                const active = pickupDate === date
                return (
                  <Pressable key={p.key} onPress={() => setPickupDate(date)} style={{ borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border }}>
                    <Text style={{ color: active ? '#fff' : theme.mutedForeground, fontSize: 13, fontWeight: '600' }}>{p.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </Field>
          <Field label={t('postLoad.deliveryDate')}>
            <TextInput style={inputStyle} value={dropDate} onChangeText={setDropDate} placeholder={`e.g. ${isoDaysFromNow(3)}`} placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
          <Field label={t('postLoad.loadingNotes')}>
            <TextInput style={inputStyle} value={loadingReq} onChangeText={setLoadingReq} placeholder={t('postLoad.loadingNotesExample')} placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
          <Field label={t('postLoad.specialHandling')}>
            <TextInput style={inputStyle} value={specialReq} onChangeText={setSpecialReq} placeholder={t('postLoad.specialExample')} placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
          <Field label={t('postLoad.advance')}>
            <TextInput style={inputStyle} value={advanceAmount} onChangeText={setAdvanceAmount} placeholder={t('postLoad.advanceExample')} keyboardType="decimal-pad" placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
          <Field label={t('postLoad.paymentTerms')}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {['Advance', 'Pay later'].map((opt) => (
                <Pressable key={opt} onPress={() => setPayLater(opt === 'Pay later')} style={{ borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: payLater === (opt === 'Pay later') ? theme.primary : theme.background, borderColor: theme.border }}>
                  <Text style={{ color: payLater === (opt === 'Pay later') ? '#fff' : theme.mutedForeground, fontSize: 13, fontWeight: '600' }}>{opt}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
        </>
      )}

      {step === 4 && (
        <>
          <Field label="How should transporters quote?">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {commercialModels.map((m) => (
                <Pressable key={m.key} onPress={() => setCommercialModel(m.key)} style={{ borderRadius: radius.md, borderWidth: 1, padding: spacing.md, backgroundColor: commercialModel === m.key ? theme.primary : theme.background, borderColor: commercialModel === m.key ? theme.primary : theme.border }}>
                  <Text style={{ color: commercialModel === m.key ? '#fff' : theme.foreground, fontSize: 13, fontWeight: '700' }}>{m.label}</Text>
                  <Text style={{ color: commercialModel === m.key ? 'rgba(255,255,255,0.85)' : theme.mutedForeground, fontSize: 11, marginTop: 2 }}>{m.desc}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
          {commercialModel === 'open_bidding' && (
            <Field label="Reference rate (₹, optional)">
              <TextInput style={inputStyle} value={referenceRate} onChangeText={setReferenceRate} placeholder="e.g. 40000" keyboardType="decimal-pad" placeholderTextColor={theme.mutedForeground + '88'} />
            </Field>
          )}
          <Field label="Advance percentage (%, optional)">
            <TextInput style={inputStyle} value={advancePct} onChangeText={setAdvancePct} placeholder="e.g. 30" keyboardType="decimal-pad" placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
        </>
      )}

      {step === 5 && (
        <View style={{ gap: spacing.sm }}>
          <Field label="Ready to publish — quick check:">{null}</Field>
          <PreviewRow label="Route" value={`${pickup} → ${drop}`} theme={theme} />
          <PreviewRow label="Cargo" value={`${weight} t · ${material}`} theme={theme} />
          <PreviewRow label="Truck" value={`${truckType} · ${modelName} · ${bodyType}`} theme={theme} />
          <PreviewRow label="Pickup" value={pickupDate} theme={theme} />
          <PreviewRow label={t('postLoad.stepPricing')} value={commercialModels.find((m) => m.key === commercialModel)?.label ?? ''} theme={theme} />
          <PreviewRow label="Advance" value={advanceAmount ? `₹${advanceAmount}` : advancePct ? `${advancePct}%` : '—'} theme={theme} />
          <PreviewRow label="Payment" value={payLater ? 'Pay later' : 'Advance'} theme={theme} />
        </View>
      )}
    </Wizard>
  )
}

function PreviewRow({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.border }}>
      <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: theme.foreground, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: spacing.lg }} numberOfLines={1}>{value || '—'}</Text>
    </View>
  )
}
