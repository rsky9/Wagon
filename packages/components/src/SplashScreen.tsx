import { useEffect } from 'react'
import { View, Text, StyleSheet, Image, type ImageSourcePropType } from 'react-native'

/** Brand splash shown on launch while the session/language restores. */
export function SplashScreen({ showLang = false, logo, logoSize = 96 }: { showLang?: boolean; logo?: ImageSourcePropType; logoSize?: number }) {
  useEffect(() => {
    // no-op; navigation decides when to advance
  }, [])

  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        {logo ? (
          <Image source={logo} style={{ width: logoSize, height: logoSize }} resizeMode="contain" />
        ) : (
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>🚛</Text>
          </View>
        )}
        <Text style={styles.brand}>
          Wagon<Text style={styles.dot}>.</Text>
        </Text>
        <Text style={styles.tagline}>Move goods. Get paid.</Text>
      </View>
      {showLang && <View />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' },
  logoWrap: { alignItems: 'center' },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: 'rgba(249,115,22,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoText: { fontSize: 44 },
  brand: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.02 },
  dot: { color: '#F97316' },
  tagline: { color: 'rgba(255,255,255,0.6)', fontSize: 15, marginTop: 6 },
})
