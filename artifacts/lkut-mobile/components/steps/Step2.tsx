import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MetricInput } from '@/components/MetricInput';
import { THRESHOLDS } from '@/lib/lkutCalculator';

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.groupTitle, { color: colors.foreground, borderBottomColor: colors.border }]}>
      {title}
    </Text>
  );
}

export function Step2() {
  const colors = useColors();

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Kesehatan Organisasi</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
        Masukkan indikator manajerial dan kepatuhan perusahaan Anda.
      </Text>

      {/* A. Perkembangan Organisasi */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <SectionHeader title="A. Perkembangan Organisasi" colors={colors} />
        <MetricInput field="gcgYears" label="Penerapan GCG" unit="Tahun" bands={THRESHOLDS.gcgYears} />
        <MetricInput field="certificates" label="Jumlah Sertifikat" unit="Dok" bands={THRESHOLDS.certificates} />
        <MetricInput field="awards" label="Penghargaan" unit="Penghargaan" bands={THRESHOLDS.awards} />
      </View>

      {/* B. Manajemen Operasi */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <SectionHeader title="B. Manajemen Operasi (Tahun Penerapan)" colors={colors} />
        <MetricInput field="moSupplyChain" label="Manajemen Rantai Pasok" unit="Thn" bands={THRESHOLDS.mo} />
        <MetricInput field="moMaterialQuality" label="Mutu Material" unit="Thn" bands={THRESHOLDS.mo} />
        <MetricInput field="moEquipmentQuality" label="Mutu Peralatan" unit="Thn" bands={THRESHOLDS.mo} />
        <MetricInput field="moK3" label="K3 (Keselamatan Kerja)" unit="Thn" bands={THRESHOLDS.mo} />
        <MetricInput field="moProcedures" label="Prosedur Kerja" unit="Thn" bands={THRESHOLDS.mo} />
        <MetricInput field="moResultQuality" label="Mutu Hasil Kerja" unit="Thn" bands={THRESHOLDS.mo} />
        <MetricInput field="moOM" label="Operasi & Pemeliharaan" unit="Thn" bands={THRESHOLDS.mo} />
        <MetricInput field="moSocialProtection" label="Perlindungan Sosial" unit="Thn" bands={THRESHOLDS.mo} />
        <MetricInput field="moEnvironment" label="Lingkungan Hidup" unit="Thn" bands={THRESHOLDS.mo} />
      </View>

      {/* C. Pemanfaatan Teknologi */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <SectionHeader title="C. Pemanfaatan Teknologi & Peralatan" colors={colors} />
        <MetricInput field="equipmentRatio" label="Rasio Peralatan" bands={THRESHOLDS.equipmentRatio} />
        <MetricInput field="equipmentNewness" label="Kebaruan Peralatan" unit="%" bands={THRESHOLDS.equipmentNewness} />
      </View>

      {/* D. Perkembangan SDM */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <SectionHeader title="D. Perkembangan SDM" colors={colors} />
        <MetricInput field="hrProductivity" label="Produktivitas SDM" unit="Rp Jt" bands={THRESHOLDS.hrProductivity} />
        <MetricInput field="hrEmpowerment" label="Pemberdayaan SDM" unit="%" bands={THRESHOLDS.hrEmpowerment} />
        <MetricInput
          field="companyCapacity"
          label="Kapasitas Perusahaan"
          unit="Rasio"
          bands={THRESHOLDS.companyCapacity}
          hint="Lebih kecil = lebih baik"
        />
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
  groupTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
});
