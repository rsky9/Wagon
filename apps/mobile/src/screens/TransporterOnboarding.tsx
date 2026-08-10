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

export function TransporterOnboarding({ onComplete, onSkip }: Props) {
  const theme = useTheme()
  const [companyName, setCompanyName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [fleetSize, setFleetSize] = useState('')

  const inputStyle = questInputStyle(theme)

  const submit = async () => {
    try {
      await api.post('/onboarding/transporter', {
        companyName,
        ownerName,
        fleetSize: Number(fleetSize) || 1,
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
      roleName="transporter"
      phaseTitle="Phase 1 · Get started"
      phaseSubtitle="Trucks, drivers, bank details and documents unlock in Phase 2 — you can add them anytime from your profile."
      steps={[
        {
          key: 'company',
          title: 'Tell us about your business',
          icon: '🏢',
          hint: "You'll be able to edit this anytime in Settings.",
          valid: !!companyName.trim() && ownerName.trim().length >= 2,
          render: () => (
            <>
              <QuestField label="Company / business name">
                <TextInput style={inputStyle} value={companyName} onChangeText={setCompanyName} placeholder="e.g. Sharma Transport" placeholderTextColor={theme.mutedForeground + '88'} />
              </QuestField>
              <QuestField label="Your name">
                <TextInput style={inputStyle} value={ownerName} onChangeText={setOwnerName} placeholder="Full name" placeholderTextColor={theme.mutedForeground + '88'} />
              </QuestField>
            </>
          ),
        },
        {
          key: 'fleet',
          title: 'How big is your fleet?',
          icon: '🚚',
          hint: 'You can add individual trucks later.',
          valid: !!fleetSize && Number(fleetSize) >= 1,
          render: () => (
            <QuestField label="Number of trucks you operate">
              <TextInput style={inputStyle} value={fleetSize} onChangeText={setFleetSize} placeholder="e.g. 3" keyboardType="number-pad" placeholderTextColor={theme.mutedForeground + '88'} />
            </QuestField>
          ),
        },
        {
          key: 'go',
          title: 'Ready to roll',
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
