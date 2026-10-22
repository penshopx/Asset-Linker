import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Linking, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import { useColors } from '@/hooks/useColors';
import { useForm } from '@/context/FormContext';
import {
  calculateResult,
  getLowestIndicators,
  getGradeColor,
} from '@/lib/lkutCalculator';
import { getSalesAlerts, TriggerAlert } from '@/lib/salesEngine';
import { KonfirmasiPesananModal } from '@/components/KonfirmasiPesananModal';

const INDICATOR_NAMES: Record<string, string> = {
  assetGrowth: 'Pertumbuhan Aset',
  gpm: 'Gross Profit Margin',
  assetTurnover: 'Perputaran Aset',
  currentRatio: 'Current Ratio',
  der: 'DER',
  fcf: 'Arus Kas Bebas',
  gcgYears: 'Tahun GCG',
  certificates: 'Sertifikasi',
  awards: 'Penghargaan',
  moSupplyChain: 'MO: Supply Chain',
  moMaterialQuality: 'MO: Kualitas Material',
  moEquipmentQuality: 'MO: Kualitas Peralatan',
  moK3: 'MO: K3',
  moProcedures: 'MO: Prosedur',
  moResultQuality: 'MO: Kualitas Hasil',
  moOM: 'MO: Operasi & Maintenance',
  moSocialProtection: 'MO: Perlindungan Sosial',
  moEnvironment: 'MO: Lingkungan',
  equipmentRatio: 'Rasio Peralatan',
  equipmentNewness: 'Kebaruan Peralatan',
  hrProductivity: 'Produktivitas SDM',
  hrEmpowerment: 'Pemberdayaan SDM',
  companyCapacity: 'Kapasitas Perusahaan',
};

function getActionContent(key: string) {
  if (['gcgYears', 'certificates', 'awards'].includes(key)) {
    return { title: 'Tingkatkan Skor GCG & Sertifikasi', btn: 'Urus di DP Store', href: 'https://dp.dokumenproyek.com' };
  }
  if (key === 'hrEmpowerment') {
    return { title: 'Penuhi Syarat Pelatihan Minimum 3 Hari', btn: 'Bimtek di Gaia Store', href: 'https://gaia.dokumenproyek.com' };
  }
  if (key.startsWith('mo')) {
    return { title: 'Tingkatkan Sistem Manajemen Operasi', btn: 'Konsultasi Dokumen', href: 'https://dp.dokumenproyek.com' };
  }
  return { title: `Optimalkan: ${INDICATOR_NAMES[key] || key}`, btn: 'Konsultasi Sekarang', href: 'https://dp.dokumenproyek.com' };
}

function ScoreBar({ label, score, weight, color }: { label: string; score: number; weight: string; color: string }) {
  const colors = useColors();
  return (
    <View style={styles.barRow}>
      <View style={styles.barLabelRow}>
        <Text style={[styles.barLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.barWeight, { color: colors.mutedForeground }]}>{weight}</Text>
        <Text style={[styles.barScore, { color: colors.foreground }]}>{score.toFixed(1)}</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.secondary }]}>
        <View style={[styles.barFill, { width: `${score}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

interface Step4Props {
  onReset: () => void;
}

export function Step4({ onReset }: Step4Props) {
  const colors = useColors();
  const { data } = useForm();
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState('');

  const { indicatorScores, financialScore, orgScore, managementScore, projectScore, finalScore, grade } = calculateResult(data);
  const gradeColor = getGradeColor(grade);
  const needsPUB = ['B', 'C', 'D'].includes(grade);

  const lowestKeys = getLowestIndicators(indicatorScores, 3);
  const salesAlerts = getSalesAlerts(data, indicatorScores);

  const copyURL = async (url: string) => {
    let copied = false;
    try {
      copied = await Clipboard.setStringAsync(url);
    } catch {
      // Clipboard permissions can be denied; keep the URL available manually.
    }
    const message = copied
      ? 'Tautan disalin. Tempelkan di browser Anda.'
      : 'Tautan belum dapat disalin. Silakan salin alamat berikut secara manual.';
    if (Platform.OS === 'web') {
      setCopyFeedback(message);
    } else {
      Alert.alert(copied ? 'Tautan disalin' : 'Gagal menyalin tautan', `${message}\n\n${url}`);
    }
  };

  const openURL = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      const title = 'Tautan tidak dapat dibuka';
      const message = 'Silakan coba lagi atau buka tautan melalui browser Anda.';
      if (Platform.OS === 'web') {
        setCopyFeedback('');
        setFailedURL(url);
      } else {
        Alert.alert(title, `${message}\n\n${url}`, [
          { text: 'Tutup', style: 'cancel' },
          { text: 'Salin tautan', onPress: () => { void copyURL(url); } },
        ]);
      }
      // Haptics are optional; their availability must not affect link feedback.
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const openPUB = async () => {
    try {
      await WebBrowser.openBrowserAsync('https://dp.dokumenproyek.com');
    } catch {
      Alert.alert('Tautan belum dapat dibuka', 'Silakan coba lagi untuk membuka konsultasi PUB.');
    }
  };

  return (
    <View>
      {failedURL !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setFailedURL(null)}
        >
          <View style={[styles.linkFailureOverlay, { backgroundColor: colors.primary }]}>
            <View
              style={[styles.linkFailureCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}
              accessibilityViewIsModal
              testID="link-failure-dialog"
            >
              <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.foreground }]}>
                Tautan tidak dapat dibuka
              </Text>
              <Text style={{ color: colors.foreground }}>
                Silakan coba lagi atau buka tautan melalui browser Anda.
              </Text>
              <Text selectable style={[styles.linkFailureURL, { color: colors.foreground }]} testID="link-failure-url">
                {failedURL}
              </Text>
              {copyFeedback !== '' && (
                <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }} testID="link-copy-feedback">
                  {copyFeedback}
                </Text>
              )}
              <View style={styles.ctaRow}>
                <Pressable
                  accessibilityRole="button"
                  testID="link-failure-close"
                  onPress={() => setFailedURL(null)}
                  style={[styles.ctaBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
                >
                  <Text style={{ color: colors.foreground }}>Tutup</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID="link-failure-copy"
                  onPress={() => copyURL(failedURL)}
                  style={[styles.ctaBtn, { backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: colors.radius }]}
                >
                  <Text style={{ color: colors.primaryForeground }}>Salin tautan</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
      {/* PUB Warning */}
      {needsPUB && (
        <Pressable
          onPress={openPUB}
          style={[styles.warningBanner, { borderRadius: colors.radius }]}
          testID="warning-banner"
        >
          <View style={styles.warningContent}>
            <Ionicons name="warning" size={20} color="#b91c1c" />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Grade di bawah A — Wajib PUB Khusus</Text>
              <Text style={styles.warningBody}>
                Sesuai Permen PUPR 7/2024 — tap untuk konsultasi solusi PUB.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#b91c1c" />
          </View>
        </Pressable>
      )}

      {/* Sales Alert Cards */}
      {salesAlerts.length > 0 && (
        <View testID="sales-alerts-section">
          {salesAlerts.map((alert) => {
            const isCritical = alert.severity === 'critical';
            const bgColor = isCritical ? '#fee2e2' : '#fefce8';
            const borderColor = isCritical ? '#fca5a5' : '#fde047';
            const titleColor = isCritical ? '#b91c1c' : '#854d0e';
            const bodyColor = isCritical ? '#991b1b' : '#713f12';
            return (
              <View
                key={alert.id}
                style={[styles.alertCard, { backgroundColor: bgColor, borderColor, borderRadius: colors.radius }]}
                testID={`sales-alert-${alert.id}`}
              >
                <Text style={[styles.alertTitle, { color: titleColor }]}>{alert.title}</Text>
                <Text style={[styles.alertBody, { color: bodyColor }]}>{alert.body}</Text>
                <View style={styles.alertProducts}>
                  {alert.products.map((product, pIdx) => (
                    <Pressable
                      key={pIdx}
                      onPress={() => openURL(product.href)}
                      style={({ pressed }) => [
                        styles.alertProductBtn,
                        {
                          borderRadius: colors.radius,
                          backgroundColor: product.primary
                            ? (isCritical ? '#b91c1c' : '#854d0e')
                            : (pressed ? borderColor : 'rgba(0,0,0,0.06)'),
                          borderColor: product.primary ? 'transparent' : borderColor,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                      testID={`alert-product-${alert.id}-${pIdx}`}
                    >
                      <Text
                        style={[
                          styles.alertProductText,
                          { color: product.primary ? '#fff' : titleColor },
                        ]}
                      >
                        {product.label}
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={13}
                        color={product.primary ? '#fff' : titleColor}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Grade Circle */}
      <View style={[styles.gradeCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Skor Akhir LKUT</Text>
        <View style={styles.gradeCircleWrap}>
          <View style={[styles.gradeCircle, { borderColor: gradeColor }]}>
            <Text style={[styles.gradeNum, { color: gradeColor }]}>{finalScore.toFixed(1)}</Text>
            <Text style={[styles.gradeLetter, { color: gradeColor }]} testID="grade-display">
              Grade {grade}
            </Text>
          </View>
        </View>
        <Text style={[styles.gradeCaption, { color: colors.mutedForeground }]}>
          Kualifikasi: {data.kualifikasi}
        </Text>
      </View>

      {/* Score Breakdown */}
      <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Rincian Komponen Skor</Text>
        <ScoreBar label="Keuangan" score={financialScore} weight="18%" color="#f59e0b" />
        <ScoreBar label="Organisasi" score={orgScore} weight="42%" color="#0f172a" />
        <ScoreBar label="Proyek" score={projectScore} weight="40%" color="#10b981" />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.finalRow}>
          <Text style={[styles.finalLabel, { color: colors.foreground }]}>Skor Akhir</Text>
          <Text style={[styles.finalScore, { color: gradeColor }]}>{finalScore.toFixed(1)} / 100</Text>
        </View>
      </View>

      {/* Action Center */}
      <View style={[styles.actionCard, { backgroundColor: colors.primary, borderRadius: colors.radius }]} testID="action-center">
        <View style={styles.actionHeader}>
          <View style={[styles.actionIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="trending-up" size={18} color={colors.primary} />
          </View>
          <Text style={styles.actionTitle}>Prioritas Perbaikan</Text>
        </View>
        {lowestKeys.map((key, idx) => {
          const action = getActionContent(key);
          const sc = indicatorScores[key as keyof typeof indicatorScores];
          return (
            <View key={key} style={[styles.actionItem, { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: colors.radius }]} testID={`action-card-${key}`}>
              <View style={styles.actionItemHeader}>
                <View style={[styles.priorityBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Text style={styles.priorityText}>Prioritas #{idx + 1}</Text>
                </View>
                <Text style={styles.actionScore}>Skor: {sc.toFixed(1)}</Text>
              </View>
              <Text style={styles.actionItemTitle}>{action.title}</Text>
              <Pressable
                onPress={() => openURL(action.href)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: pressed ? colors.accent : 'rgba(255,255,255,0.12)', borderRadius: 6 },
                ]}
                testID={`action-btn-${key}`}
              >
                <Text style={styles.actionBtnText}>{action.btn}</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* CTAs */}
      <View
        style={[
          styles.orderCard,
          { backgroundColor: colors.accent, borderRadius: colors.radius },
        ]}
        testID="order-cta"
      >
        <View style={styles.orderCardCopy}>
          <Text style={[styles.orderTitle, { color: colors.primary }]}>
            Siap meningkatkan nilai LKUT?
          </Text>
          <Text style={[styles.orderBody, { color: colors.primary }]}>
            Pesan layanan konsultasi atau dokumen langsung dari aplikasi.
          </Text>
        </View>
        <Pressable
          onPress={() => {
            setOrderModalOpen(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
          style={({ pressed }) => [
            styles.orderButton,
            {
              backgroundColor: pressed ? colors.secondary : colors.primary,
              borderRadius: colors.radius,
            },
          ]}
          testID="order-cta-btn"
        >
          <Ionicons name="cart-outline" size={17} color={colors.primaryForeground} />
          <Text style={[styles.orderButtonText, { color: colors.primaryForeground }]}>
            Konfirmasi Pesanan
          </Text>
        </Pressable>
      </View>

      <View style={styles.ctaRow}>
        <Pressable
          testID="reset-btn"
          onPress={() => { onReset(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: pressed ? colors.secondary : colors.card, borderColor: colors.border, borderRadius: colors.radius, flex: 1 },
          ]}
        >
          <Ionicons name="refresh" size={16} color={colors.foreground} />
          <Text style={[styles.ctaBtnText, { color: colors.foreground }]}>Hitung Ulang</Text>
        </Pressable>
        <Pressable
          onPress={() => openURL('https://dp.dokumenproyek.com')}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: pressed ? '#1e293b' : colors.primary, borderColor: colors.primary, borderRadius: colors.radius, flex: 1 },
          ]}
        >
          <Ionicons name="globe-outline" size={16} color="#fff" />
          <Text style={[styles.ctaBtnText, { color: '#fff' }]}>dp.dokumenproyek.com</Text>
        </Pressable>
      </View>

      {orderModalOpen && (
        <KonfirmasiPesananModal
          visible
          onClose={() => setOrderModalOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  linkFailureOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  linkFailureCard: {
    width: '100%',
    maxWidth: 460,
    padding: 20,
    gap: 12,
  },
  linkFailureURL: {
    fontSize: 14,
    lineHeight: 20,
  },
  warningBanner: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 14,
    marginBottom: 16,
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#b91c1c',
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  warningBody: {
    fontSize: 12,
    color: '#991b1b',
    marginTop: 2,
    lineHeight: 16,
    fontFamily: Platform.OS !== 'web' ? 'Inter_400Regular' : undefined,
  },
  gradeCard: {
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 16,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  gradeCircleWrap: {
    marginBottom: 12,
  },
  gradeCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeNum: {
    fontSize: 36,
    fontWeight: '900' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  gradeLetter: {
    fontSize: 16,
    fontWeight: '700' as const,
    marginTop: 2,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  gradeCaption: {
    fontSize: 12,
    fontFamily: Platform.OS !== 'web' ? 'Inter_400Regular' : undefined,
  },
  breakdownCard: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  barRow: {
    marginBottom: 12,
  },
  barLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    flex: 1,
    fontFamily: Platform.OS !== 'web' ? 'Inter_600SemiBold' : undefined,
  },
  barWeight: {
    fontSize: 11,
    marginRight: 8,
    fontFamily: Platform.OS !== 'web' ? 'Inter_400Regular' : undefined,
  },
  barScore: {
    fontSize: 13,
    fontWeight: '700' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  finalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  finalLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  finalScore: {
    fontSize: 18,
    fontWeight: '900' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  actionCard: {
    padding: 16,
    marginBottom: 16,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  actionItem: {
    padding: 14,
    marginBottom: 10,
  },
  actionItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  actionScore: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#fca5a5',
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  actionItemTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#fff',
    marginBottom: 10,
    lineHeight: 18,
    fontFamily: Platform.OS !== 'web' ? 'Inter_600SemiBold' : undefined,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#fff',
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  orderCard: {
    padding: 16,
    marginBottom: 16,
  },
  orderCardCopy: {
    marginBottom: 13,
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  orderBody: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
    opacity: 0.85,
    fontFamily: Platform.OS !== 'web' ? 'Inter_400Regular' : undefined,
  },
  orderButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
  },
  orderButtonText: {
    fontSize: 13,
    fontWeight: '700' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    gap: 8,
  },
  ctaBtnText: {
    fontSize: 13,
    fontWeight: '700' as const,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  alertCard: {
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    marginBottom: 6,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
  alertBody: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
    fontFamily: Platform.OS !== 'web' ? 'Inter_400Regular' : undefined,
  },
  alertProducts: {
    gap: 8,
  },
  alertProductBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 8,
  },
  alertProductText: {
    fontSize: 12,
    fontWeight: '700' as const,
    flex: 1,
    fontFamily: Platform.OS !== 'web' ? 'Inter_700Bold' : undefined,
  },
});
