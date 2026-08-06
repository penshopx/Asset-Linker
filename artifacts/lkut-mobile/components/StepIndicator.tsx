import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';

const STEP_LABELS = ['Keuangan', 'Organisasi', 'Proyek', 'Hasil'];

interface StepIndicatorProps {
  currentStep: number;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === currentStep;
        const isDone = stepNum < currentStep;
        return (
          <View key={stepNum} style={styles.stepWrapper}>
            {/* connector line */}
            {idx > 0 && (
              <View
                style={[
                  styles.line,
                  { backgroundColor: isDone ? colors.accent : 'rgba(255,255,255,0.3)' },
                ]}
              />
            )}
            <View style={styles.dotCol}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: isActive
                      ? colors.accent
                      : isDone
                      ? colors.accent
                      : 'rgba(255,255,255,0.25)',
                    borderColor: isActive ? colors.accent : isDone ? colors.accent : 'rgba(255,255,255,0.4)',
                    width: isActive ? 28 : 22,
                    height: isActive ? 28 : 22,
                  },
                ]}
              >
                {isDone ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : (
                  <Text
                    style={[
                      styles.dotText,
                      { color: isActive ? colors.primary : 'rgba(255,255,255,0.7)', fontWeight: isActive ? '700' : '500' },
                    ]}
                  >
                    {stepNum}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: isActive ? colors.accent : isDone ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)',
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stepWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotCol: {
    alignItems: 'center',
    flex: 1,
  },
  line: {
    flex: 1,
    height: 2,
    marginBottom: 20,
    borderRadius: 1,
  },
  dot: {
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dotText: {
    fontSize: 11,
  },
  checkmark: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700' as const,
  },
  label: {
    fontSize: 10,
    textAlign: 'center',
  },
});
