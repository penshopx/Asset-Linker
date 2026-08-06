import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { StepIndicator } from '@/components/StepIndicator';
import { Step1 } from '@/components/steps/Step1';
import { Step2 } from '@/components/steps/Step2';
import { Step3 } from '@/components/steps/Step3';
import { Step4 } from '@/components/steps/Step4';
import { FormProvider, useForm } from '@/context/FormContext';
import { useColors } from '@/hooks/useColors';

function WizardContent() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { reset } = useForm();
  const [step, setStep] = useState(1);

  const nextStep = () => {
    const next = Math.min(4, step + 1);
    setStep(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const prevStep = () => {
    const prev = Math.max(1, step - 1);
    setStep(prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleReset = () => {
    reset();
    setStep(1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.primary,
          paddingTop: Platform.OS === 'web' ? webTopInset : insets.top,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>LKUT Grade Simulator</Text>
          <Text style={[styles.headerSubtitle, { color: colors.accent }]}>
            Permen PUPR No. 7/2024
          </Text>
        </View>
        <View style={[styles.gradeBadge, { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.3)' }]}>
          <Text style={[styles.gradeBadgeText, { color: colors.accent }]}>BUJK</Text>
        </View>
      </View>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* Content */}
      <View style={[styles.contentWrap, { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 }]}>
        <KeyboardAwareScrollViewCompat
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom:
                step < 4
                  ? 100 + (Platform.OS === 'web' ? webBottomInset : insets.bottom)
                  : 32 + (Platform.OS === 'web' ? webBottomInset : insets.bottom),
            },
          ]}
          bottomOffset={80}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && <Step1 />}
          {step === 2 && <Step2 />}
          {step === 3 && <Step3 />}
          {step === 4 && <Step4 onReset={handleReset} />}
        </KeyboardAwareScrollViewCompat>

        {/* Nav footer - fixed inside white area */}
        {step < 4 && (
          <View
            style={[
              styles.footer,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                paddingBottom:
                  Platform.OS === 'web'
                    ? webBottomInset + 12
                    : insets.bottom + 12,
              },
            ]}
          >
            <Pressable
              onPress={prevStep}
              disabled={step === 1}
              style={({ pressed }) => [
                styles.navBtn,
                styles.navBtnSecondary,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    step === 1
                      ? colors.secondary
                      : pressed
                      ? colors.secondary
                      : colors.card,
                  opacity: step === 1 ? 0.5 : 1,
                  borderRadius: colors.radius,
                },
              ]}
              testID="prev-btn"
            >
              <Ionicons name="arrow-back" size={16} color={step === 1 ? colors.mutedForeground : colors.foreground} />
              <Text
                style={[
                  styles.navBtnText,
                  { color: step === 1 ? colors.mutedForeground : colors.foreground },
                ]}
              >
                Sebelumnya
              </Text>
            </Pressable>

            <Pressable
              onPress={step === 3 ? nextStep : nextStep}
              style={({ pressed }) => [
                styles.navBtn,
                styles.navBtnPrimary,
                {
                  backgroundColor:
                    step === 3
                      ? pressed ? '#1e293b' : colors.primary
                      : pressed
                      ? '#d97706'
                      : colors.accent,
                  borderRadius: colors.radius,
                  flex: 1.4,
                },
              ]}
              testID="next-btn"
            >
              <Text
                style={[
                  styles.navBtnText,
                  {
                    color: step === 3 ? '#fff' : colors.primary,
                    fontWeight: '700' as const,
                  },
                ]}
              >
                {step === 3 ? 'Lihat Hasil' : 'Selanjutnya'}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={step === 3 ? '#fff' : colors.primary}
              />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export default function WizardScreen() {
  return (
    <FormProvider>
      <WizardContent />
    </FormProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: '#ffffff',
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '600' as const,
    marginTop: 1,
    fontFamily: Platform.OS !== 'web' ? 'Inter_600SemiBold' : undefined,
  },
  gradeBadge: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  gradeBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  contentWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1,
  },
  navBtnSecondary: {},
  navBtnPrimary: {
    borderColor: 'transparent',
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_600SemiBold' : undefined,
  },
});
