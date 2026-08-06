import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useForm } from '@/context/FormContext';
import * as Haptics from 'expo-haptics';

const QUICK_VALUES = [0, 25, 50, 75, 100];

export function Step3() {
  const colors = useColors();
  const { data, setField } = useForm();
  const score = data.projectScore;

  const change = (delta: number) => {
    const next = Math.max(0, Math.min(100, score + delta));
    setField('projectScore', next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const setQuick = (val: number) => {
    setField('projectScore', val);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const getScoreColor = () => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Kinerja Proyek</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
        Atur rata-rata nilai evaluasi kinerja proyek perusahaan Anda.
      </Text>

      {/* Score Display */}
      <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {/* Big number */}
        <View style={[styles.scoreBig, { borderColor: getScoreColor() }]}>
          <Text style={[styles.scoreNumber, { color: getScoreColor() }]}>{score}</Text>
          <Text style={[styles.scorePercent, { color: colors.mutedForeground }]}>/ 100</Text>
        </View>

        {/* Progress bar */}
        <View style={[styles.track, { backgroundColor: colors.secondary }]}>
          <View style={[styles.fill, { width: `${score}%` as any, backgroundColor: getScoreColor() }]} />
        </View>

        {/* +/- controls */}
        <View style={styles.controls}>
          {([-10, -5, -1] as const).map((d) => (
            <Pressable
              key={d}
              onPress={() => change(d)}
              style={({ pressed }) => [
                styles.controlBtn,
                {
                  backgroundColor: pressed ? colors.secondary : colors.background,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Text style={[styles.controlText, { color: colors.foreground }]}>{d}</Text>
            </Pressable>
          ))}
          <View style={styles.controlSpacer} />
          {([1, 5, 10] as const).map((d) => (
            <Pressable
              key={d}
              onPress={() => change(d)}
              style={({ pressed }) => [
                styles.controlBtn,
                {
                  backgroundColor: pressed ? colors.accent : colors.primary,
                  borderColor: colors.primary,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Text style={[styles.controlText, { color: '#fff' }]}>+{d}</Text>
            </Pressable>
          ))}
        </View>

        {/* Quick select */}
        <Text style={[styles.quickLabel, { color: colors.mutedForeground }]}>Pilih cepat</Text>
        <View style={styles.quickRow}>
          {QUICK_VALUES.map((v) => (
            <Pressable
              key={v}
              onPress={() => setQuick(v)}
              style={[
                styles.quickBtn,
                {
                  backgroundColor: score === v ? colors.primary : colors.secondary,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Text style={[styles.quickText, { color: score === v ? '#fff' : colors.foreground }]}>
                {v}%
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Info box */}
      <View style={[styles.infoBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderRadius: colors.radius }]}>
        <Text style={styles.infoText}>
          <Text style={styles.infoBold}>Info: </Text>
          Nilai ini merepresentasikan bobot 40% dari skor akhir berdasarkan kepatuhan pelaksanaan proyek sesuai Permen PUPR 7/2024.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 4,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
    fontFamily: Platform.OS !== 'web' ? 'Inter_400Regular' : undefined,
  },
  scoreCard: {
    borderWidth: 1,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  scoreBig: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: '900' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  scorePercent: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  track: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    marginBottom: 20,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    alignSelf: 'stretch',
  },
  controlSpacer: {
    flex: 1,
  },
  controlBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    minWidth: 46,
    alignItems: 'center',
  },
  controlText: {
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    marginBottom: 10,
    alignSelf: 'flex-start',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickText: {
    fontSize: 13,
    fontWeight: '700' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  infoBox: {
    borderWidth: 1,
    padding: 14,
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
    fontFamily: Platform.OS !== 'web' ? 'Inter_400Regular' : undefined,
  },
  infoBold: {
    fontWeight: '700' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
});
