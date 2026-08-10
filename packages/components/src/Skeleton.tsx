import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Easing } from 'react-native'
import { useTheme, radius, spacing } from '@wagon/design'

interface Props {
  height?: number
  width?: number | `${number}%` | 'auto'
  radius?: number
  style?: object
}

/** Shimmer skeleton — the cheap premium loading state. */
export function Skeleton({ height = 16, width = '100%', radius: r, style }: Props) {
  const theme = useTheme()
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [anim])

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  })

  return (
    <View
      style={[
        styles.base,
        {
          height,
          width: width as number | `${number}%`,
          borderRadius: r ?? radius.sm,
          backgroundColor: theme.muted,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.shine,
          {
            transform: [{ translateX }],
            backgroundColor: 'rgba(255,255,255,0.4)',
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  shine: { width: 120, height: '100%', opacity: 0.5 },
  feedCard: { padding: spacing.lg },
})

/** Load-feed skeleton: mimics price, route, meta rows. */
export function FeedSkeleton({ count = 5 }: { count?: number }) {
  const theme = useTheme()
  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.feedCard,
            {
              backgroundColor: theme.card,
              borderRadius: radius.xl,
              padding: spacing.lg,
              gap: spacing.md,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Skeleton width={110} height={26} />
            <Skeleton width={70} height={20} radius={999} />
          </View>
          <Skeleton width="100%" height={16} />
          <Skeleton width="70%" height={16} />
          <Skeleton width="90%" height={14} />
        </View>
      ))}
    </View>
  )
}

const feedStyles = StyleSheet.create({
  card: { padding: spacing.lg },
})