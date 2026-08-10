import { useState } from 'react'
import { TextInput, Alert } from 'react-native'
import { useTheme } from '@wagon/design'
import { GamifiedOnboarding, QuestField, questInputStyle } from '@wagon/components'
import { api } from '../config'
import { awardXp } from '../gamification'

interface Props {
  onComplete: () => void
  onSkip: () => void
}

export function SupplierOnboarding({ onComplete, onSkip }: Props) {
  const theme = useTheme()
  const [companyName, setCompanyName] = useState('')
  const [gst, setGst] = useState('')
  const [pickup, setPickup] = useState('')

  const inputStyle = questInputStyle(theme)

  const submit = async () => {
    try {
      await api.post('/onboarding/supplier', {
        companyName,
        gst,
        pickupLocations: pickup.split(',').map((s) => s.trim()).filter(Boolean),
      })
      await awardXp(120, 'onboarded')
      onComplete()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed')
      throw e
    }
  }

  return (
    <GamifiedOnboarding
      roleName="supplier"
      phaseTitle="Phase 1 · Get started"
      phaseSubtitle="Billing details, payment terms and more unlock in Phase 2 — you can finish them anytime from your profile."
      steps={[
        {
          key: 'company',
          title: 'Tell us about your business',
          icon: '🏢',
          hint: "You'll be able to edit this anytime in Settings.",
          valid: !!companyName.trim(),
          render: () => (
            <>
              <QuestField label="Company / business name">
                <TextInput style={inputStyle} value={companyName} onChangeText={setCompanyName} placeholder="e.g. ABC Manufacturing" placeholderTextColor={theme.mutedForeground + '88'} />
              </QuestField>
              <QuestField label="GST number (optional for now)">
                <TextInput style={inputStyle} value={gst} onChangeText={setGst} placeholder="e.g. 36ABCDE1234F1Z5" autoCapitalize="characters" placeholderTextColor={theme.mutedForeground + '88'} />
              </QuestField>
            </>
          ),
        },
        {
          key: 'lanes',
          title: 'Where do you ship from?',
          icon: '📍',
          hint: 'Comma-separated towns — helps trucks find your loads faster.',
          valid: !!pickup.trim(),
          render: () => (
            <QuestField label="Usual pickup locations">
              <TextInput style={inputStyle} value={pickup} onChangeText={setPickup} placeholder="Hyderabad, Vijayawada" placeholderTextColor={theme.mutedForeground + '88'} />
            </QuestField>
          ),
        },
        {
          key: 'go',
          title: 'Ready to post loads',
          icon: '🚀',
          hint: 'Phase 1 is almost done — 120 XP is yours.',
          valid: true,
          render: () => null,
        },
      ]}
      xpPerStep={40}
      onSubmit={submit}
      onComplete={onComplete}
      onSkip={onSkip}
      nextLabel="Continue"
    />
  )
}
