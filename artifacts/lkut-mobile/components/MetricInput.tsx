import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useForm } from '@/context/FormContext';
import { LkutFormData } from '@/lib/types';
import { calculateScore } from '@/lib/lkutCalculator';

interface MetricInputProps {
  field: keyof LkutFormData;
  label: string;
  unit?: string;
  bands: [number, number][];
  hint?: string;
}

function getScoreBadge(score: number) {
  if (score < 20) return { bg: '#fee2e2', text: '#b91c1c', label: score.toFixed(0) };
  if (score < 40) return { bg: '#ffedd5', text: '#c2410c', label: score.toFixed(0) };
  if (score < 60) return { bg: '#fef9c3', text: '#854d0e', label: score.toFixed(0) };
  if (score < 80) return { bg: '#dbeafe', text: '#1d4ed8', label: score.toFixed(0) };
  return { bg: '#dcfce7', text: '#15803d', label: score.toFixed(0) };
}

export function MetricInput({ field, label, unit, bands, hint }: MetricInputProps) {
  const colors = useColors();
  const { data, setField } = useForm();
  const numValue = data[field] as number;
  const score = calculateScore(isNaN(numValue) ? 0 : numValue, bands);
  const badge = getScoreBadge(score);
  const [text, setText] = useState(String(numValue));

  const handleChange = (val: string) => {
    setText(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      setField(field, parsed);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.foreground }]} numberOfLines={1}>
          {label}
          {hint ? <Text style={styles.hintMark}> ↓</Text> : null}
        </Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}/100</Text>
        </View>
      </View>
      {hint ? <Text style={styles.hintText}>{hint}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.border,
              backgroundColor: colors.card,
              color: colors.foreground,
              borderRadius: colors.radius,
            },
          ]}
          value={text}
          onChangeText={handleChange}
          keyboardType="numeric"
          returnKeyType="done"
          selectTextOnFocus
          testID={String(field)}
          placeholderTextColor={colors.mutedForeground}
        />
        {unit ? (
          <View style={[styles.unitBadge, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
            <Text style={[styles.unitText, { color: colors.mutedForeground }]}>{unit}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    flex: 1,
    marginRight: 8,
    fontFamily: Platform.OS !== 'web' ? 'Inter_600SemiBold' : undefined,
  },
  hintMark: {
    color: '#94a3b8',
    fontSize: 12,
  },
  hintText: {
    fontSize: 10,
    color: '#94a3b8',
    marginBottom: 4,
    fontStyle: 'italic',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
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
  },
});
