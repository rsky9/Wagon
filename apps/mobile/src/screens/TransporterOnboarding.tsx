import { useState } from 'react'
import { TextInput, Alert } from 'react-native'
import { useTheme } from '@wagon/design'
import { GamifiedOnboarding, QuestField, questInputStyle } from '@wagon/components'
import { api } from '../config'
import { awardXp } from '../gamification'
import { useI18n } from '@wagon/i18n'

interface Props {
  onComplete: () => void
  onSkip: () => void
}

export function TransporterOnboarding({ onComplete, onSkip }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
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
              <QuestField label={t('onboarding.companyName')}>
                <TextInput style={inputStyle} value={companyName} onChangeText={setCompanyName} placeholder={t('onboarding.companyExample')} placeholderTextColor={theme.mutedForeground + '88'} />
              </QuestField>
              <QuestField label={t('onboarding.yourName')}>
                <TextInput style={inputStyle} value={ownerName} onChangeText={setOwnerName} placeholder={t('onboarding.fullName')} placeholderTextColor={theme.mutedForeground + '88'} />
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
            <QuestField label={t('onboarding.numTrucks')}>
              <TextInput style={inputStyle} value={fleetSize} onChangeText={setFleetSize} placeholder={t('onboarding.trucksExample')} keyboardType="number-pad" placeholderTextColor={theme.mutedForeground + '88'} />
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
