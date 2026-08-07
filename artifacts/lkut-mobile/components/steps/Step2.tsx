import React from 'react';
import { View, Text, StyleSheet, Platform, TextInput, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MetricInput } from '@/components/MetricInput';
import { THRESHOLDS } from '@/lib/lkutCalculator';
import { useForm } from '@/context/FormContext';

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.groupTitle, { color: colors.foreground, borderBottomColor: colors.border }]}>
      {title}
    </Text>
  );
}

export function Step2() {
  const colors = useColors();
  const { data, setField } = useForm();

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

      {/* E. Info SKK & SMAP */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <SectionHeader title="E. SKK & Dokumen SMAP" colors={colors} />

        {/* SKK Months Left */}
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
            Sisa masa berlaku SKK
          </Text>
          <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
            Kosongkan jika tidak relevan
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.textInput,
                { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, borderRadius: colors.radius },
              ]}
              value={data.skkMonthsLeft !== null && data.skkMonthsLeft !== undefined ? String(data.skkMonthsLeft) : ''}
              onChangeText={(val) => {
                if (val === '') {
                  setField('skkMonthsLeft', null);
                } else {
                  const parsed = parseInt(val, 10);
                  if (!isNaN(parsed)) setField('skkMonthsLeft', parsed);
                }
              }}
              keyboardType="numeric"
              returnKeyType="done"
              selectTextOnFocus
              placeholder="—"
              placeholderTextColor={colors.mutedForeground}
              testID="skkMonthsLeft"
            />
            <View style={[styles.unitBadge, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
              <Text style={[styles.unitText, { color: colors.mutedForeground }]}>Bulan</Text>
            </View>
          </View>
        </View>

        {/* hasSmap Toggle */}
        <View style={[styles.fieldWrap, { marginBottom: 0 }]}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
            Sudah memiliki dokumen SMAP (ISO 37001)?
          </Text>
          <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
            Dokumen Anti Penyuapan — wajib untuk perpanjangan SBU
          </Text>
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => setField('hasSmap', true)}
              style={[
                styles.toggleBtn,
                {
                  borderRadius: colors.radius,
                  backgroundColor: data.hasSmap === true ? colors.primary : colors.secondary,
                  borderColor: data.hasSmap === true ? colors.primary : colors.border,
                },
              ]}
              testID="hasSmap-yes"
            >
              <Text style={[styles.toggleText, { color: data.hasSmap === true ? '#fff' : colors.mutedForeground }]}>
                ✓ Sudah
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setField('hasSmap', false)}
              style={[
                styles.toggleBtn,
                {
                  borderRadius: colors.radius,
                  backgroundColor: data.hasSmap === false ? '#b91c1c' : colors.secondary,
                  borderColor: data.hasSmap === false ? '#b91c1c' : colors.border,
                },
              ]}
              testID="hasSmap-no"
            >
              <Text style={[styles.toggleText, { color: data.hasSmap === false ? '#fff' : colors.mutedForeground }]}>
                ✗ Belum
              </Text>
            </Pressable>
          </View>
        </View>
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
  fieldWrap: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 2,
    fontFamily: Platform.OS !== 'web' ? 'Inter_600SemiBold' : undefined,
  },
  fieldHint: {
    fontSize: 11,
    marginBottom: 8,
    fontStyle: 'italic' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_400Regular' : undefined,
  },
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '500' as const,
  },
  unitBadge: {
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  unitText: {
    fontSize: 12,
    fontWeight: '600' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_600SemiBold' : undefined,
  },
  toggleRow: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
});
