import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useForm } from '@/context/FormContext';
import { MetricInput } from '@/components/MetricInput';
import { THRESHOLDS } from '@/lib/lkutCalculator';

const KUALIFIKASI_OPTIONS = ['Menengah', 'Besar', 'Spesialis'];

export function Step1() {
  const colors = useColors();
  const { data, setField } = useForm();

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Profil & Keuangan</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
        Pilih jenis kualifikasi dan masukkan rasio keuangan perusahaan Anda.
      </Text>

      {/* Kualifikasi Selector */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Jenis Kualifikasi</Text>
        <View style={styles.optionRow}>
          {KUALIFIKASI_OPTIONS.map((opt) => {
            const isSelected = data.kualifikasi === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setField('kualifikasi', opt)}
                style={[
                  styles.optionBtn,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.secondary,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: isSelected ? colors.primaryForeground : colors.foreground },
                  ]}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Financial Metrics */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.groupTitle, { color: colors.foreground, borderBottomColor: colors.border }]}>
          Rasio Keuangan
        </Text>
        <MetricInput field="assetGrowth" label="Pertumbuhan Aset" unit="%" bands={THRESHOLDS.assetGrowth} />
        <MetricInput field="gpm" label="Gross Profit Margin" unit="%" bands={THRESHOLDS.gpm} />
        <MetricInput field="assetTurnover" label="Perputaran Aset" unit="%" bands={THRESHOLDS.assetTurnover} />
        <MetricInput field="currentRatio" label="Current Ratio" unit="%" bands={THRESHOLDS.currentRatio} />
        <MetricInput
          field="der"
          label="Debt to Equity Ratio (DER)"
          unit="%"
          bands={THRESHOLDS.der}
          hint="Lebih kecil = lebih baik"
        />
        <MetricInput field="fcf" label="Arus Kas Bebas" unit="Rp T" bands={THRESHOLDS.fcf} />
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
  card: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 10,
    fontFamily: Platform.OS !== 'web' ? 'Inter_600SemiBold' : undefined,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_600SemiBold' : undefined,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
});
