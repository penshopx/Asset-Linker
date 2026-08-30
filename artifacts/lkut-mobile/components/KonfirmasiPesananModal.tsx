import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : '/api';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

interface FormValues {
  nama_perusahaan: string;
  nama_pic: string;
  email: string;
  whatsapp: string;
  produk: string;
  catatan: string;
}

interface KonfirmasiPesananModalProps {
  visible: boolean;
  onClose: () => void;
  defaultProduk?: string;
}

interface ApiResponse {
  order_id?: unknown;
  duplicate?: unknown;
  error?: unknown;
}

const EMPTY_FORM: FormValues = {
  nama_perusahaan: '',
  nama_pic: '',
  email: '',
  whatsapp: '',
  produk: '',
  catatan: '',
};

function createIdempotencyKey(): string {
  return `${Date.now().toString()}-${Math.random().toString(36).slice(2, 11)}`;
}

function isApiResponse(value: unknown): value is ApiResponse {
  return typeof value === 'object' && value !== null;
}

export function KonfirmasiPesananModal({
  visible,
  onClose,
  defaultProduk = '',
}: KonfirmasiPesananModalProps) {
  const colors = useColors();
  const [form, setForm] = useState<FormValues>({ ...EMPTY_FORM, produk: defaultProduk });
  const [state, setState] = useState<FormState>('idle');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const idempotencyKeyRef = useRef('');

  useEffect(() => {
    if (!visible) return;

    setForm({ ...EMPTY_FORM, produk: defaultProduk });
    setState('idle');
    setOrderId(null);
    setIsDuplicate(false);
    setErrorMessage('');
    setFieldErrors({});
    idempotencyKeyRef.current = createIdempotencyKey();
  }, [visible, defaultProduk]);

  const updateField = (field: keyof FormValues, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormValues, string>> = {};
    if (!form.nama_perusahaan.trim()) errors.nama_perusahaan = 'Wajib diisi';
    if (!form.nama_pic.trim()) errors.nama_pic = 'Wajib diisi';
    if (!form.email.trim()) {
      errors.email = 'Wajib diisi';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Format email tidak valid';
    }
    if (!form.whatsapp.trim()) errors.whatsapp = 'Wajib diisi';
    if (!form.produk.trim()) errors.produk = 'Wajib diisi';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;

    setState('submitting');
    setErrorMessage('');

    try {
      const body = new FormData();
      body.append('nama_perusahaan', form.nama_perusahaan.trim());
      body.append('nama_pic', form.nama_pic.trim());
      body.append('email', form.email.trim());
      body.append('whatsapp', form.whatsapp.trim());
      body.append('produk', form.produk.trim());
      body.append('catatan', form.catatan.trim());

      const response = await fetch(`${API_BASE}/konfirmasi-pesanan`, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKeyRef.current },
        body,
      });
      const rawResponse: unknown = await response.json().catch(() => ({}));
      const result = isApiResponse(rawResponse) ? rawResponse : {};

      if (!response.ok) {
        const message = typeof result.error === 'string' ? result.error : `Error ${response.status}`;
        throw new Error(message);
      }

      const submittedOrderId =
        typeof result.order_id === 'string' && result.order_id.trim()
          ? result.order_id.trim()
          : null;
      setOrderId(submittedOrderId);
      setIsDuplicate(result.duplicate === true);
      setState('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Terjadi kesalahan. Coba lagi.');
      setState('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(15, 23, 42, 0.65)' }]}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
          ]}
        >
          <View style={[styles.header, { backgroundColor: colors.primary }]}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.headerIcon, { backgroundColor: 'rgba(245, 158, 11, 0.18)' }]}>
                <Ionicons name="cart-outline" size={20} color={colors.accent} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.headerTitle}>Konfirmasi Pesanan</Text>
                <Text style={styles.headerSubtitle}>Tim kami akan segera menghubungi Anda</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Tutup"
              testID="close-order-modal"
            >
              <Ionicons name="close" size={22} color="#ffffff" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {state === 'success' ? (
              <SuccessView
                colors={colors}
                orderId={orderId}
                isDuplicate={isDuplicate}
                onClose={onClose}
              />
            ) : (
              <>
                {state === 'error' && (
                  <View
                    style={[
                      styles.errorBanner,
                      {
                        backgroundColor: `${colors.destructive}18`,
                        borderColor: colors.destructive,
                        borderRadius: colors.radius,
                      },
                    ]}
                    testID="order-error"
                  >
                    <Ionicons name="alert-circle-outline" size={18} color={colors.destructive} />
                    <Text style={[styles.errorText, { color: colors.destructive }]}>
                      {errorMessage}
                    </Text>
                  </View>
                )}

                <Text style={[styles.intro, { color: colors.mutedForeground }]}>
                  Lengkapi data berikut agar konsultan kami dapat menindaklanjuti kebutuhan Anda.
                </Text>
                <Field
                  label="Nama Perusahaan"
                  value={form.nama_perusahaan}
                  onChangeText={(value) => updateField('nama_perusahaan', value)}
                  placeholder="PT. Contoh Jaya Tbk"
                  error={fieldErrors.nama_perusahaan}
                  colors={colors}
                />
                <Field
                  label="Nama PIC"
                  value={form.nama_pic}
                  onChangeText={(value) => updateField('nama_pic', value)}
                  placeholder="Budi Santoso"
                  error={fieldErrors.nama_pic}
                  colors={colors}
                />
                <Field
                  label="Email"
                  value={form.email}
                  onChangeText={(value) => updateField('email', value)}
                  placeholder="pic@perusahaan.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  error={fieldErrors.email}
                  colors={colors}
                />
                <Field
                  label="WhatsApp"
                  value={form.whatsapp}
                  onChangeText={(value) => updateField('whatsapp', value)}
                  placeholder="08xxxxxxxxxx"
                  keyboardType="phone-pad"
                  error={fieldErrors.whatsapp}
                  colors={colors}
                />
                <Field
                  label="Produk / Layanan"
                  value={form.produk}
                  onChangeText={(value) => updateField('produk', value)}
                  placeholder="Contoh: Paket Tuntas SKK Jenjang 8"
                  error={fieldErrors.produk}
                  colors={colors}
                />
                <Field
                  label="Catatan (opsional)"
                  value={form.catatan}
                  onChangeText={(value) => updateField('catatan', value)}
                  placeholder="Deadline atau permintaan khusus"
                  multiline
                  colors={colors}
                />

                <Pressable
                  onPress={submit}
                  disabled={state === 'submitting'}
                  style={({ pressed }) => [
                    styles.submitButton,
                    {
                      backgroundColor: pressed ? colors.primary : colors.accent,
                      borderRadius: colors.radius,
                      opacity: state === 'submitting' ? 0.65 : 1,
                    },
                  ]}
                  testID="submit-order"
                >
                  {state === 'submitting' ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="send-outline" size={17} color={colors.primary} />
                  )}
                  <Text style={[styles.submitText, { color: colors.primary }]}>
                    {state === 'submitting' ? 'Mengirim Pesanan…' : 'Kirim Pesanan'}
                  </Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

interface ThemeColors {
  background: string;
  card: string;
  foreground: string;
  primaryForeground: string;
  secondary: string;
  mutedForeground: string;
  border: string;
  input: string;
  destructive: string;
  accent: string;
  primary: string;
  radius: number;
  info: string;
  infoBackground: string;
  infoBorder: string;
  success: string;
  successBackground: string;
  successBorder: string;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  colors,
  multiline = false,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  error?: string;
  colors: ThemeColors;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: error ? colors.destructive : colors.input,
            borderRadius: colors.radius,
            color: colors.foreground,
            minHeight: multiline ? 82 : 48,
          },
        ]}
        testID={`order-field-${label}`}
      />
      {error && <Text style={[styles.fieldError, { color: colors.destructive }]}>{error}</Text>}
    </View>
  );
}

function SuccessView({
  colors,
  orderId,
  isDuplicate,
  onClose,
}: {
  colors: ThemeColors;
  orderId: string | null;
  isDuplicate: boolean;
  onClose: () => void;
}) {
  const stateColor = isDuplicate ? colors.info : colors.success;
  const stateBackground = isDuplicate ? colors.infoBackground : colors.successBackground;
  const stateBorder = isDuplicate ? colors.infoBorder : colors.successBorder;

  return (
    <View style={styles.successView} testID={isDuplicate ? 'duplicate-order-success' : 'new-order-success'}>
      <View style={[styles.successIcon, { backgroundColor: stateBackground }]}>
        <Ionicons
          name={isDuplicate ? 'copy-outline' : 'checkmark-circle-outline'}
          size={52}
          color={stateColor}
        />
      </View>
      <Text
        style={[styles.successTitle, { color: colors.foreground }]}
        testID="order-success-title"
      >
        {isDuplicate ? 'Pesanan sudah kami terima' : 'Pesanan diterima!'}
      </Text>
      <Text
        style={[styles.successBody, { color: colors.mutedForeground }]}
        testID="order-success-body"
      >
        {isDuplicate
          ? 'Pesanan ini sudah pernah kami terima sebelumnya — berikut ID pesanan Anda.'
          : 'Tim kami akan menghubungi Anda dalam 1×24 jam melalui WhatsApp atau email yang terdaftar.'}
      </Text>
      {orderId && (
        <View
          style={[
            styles.orderIdCard,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <Text style={[styles.orderIdLabel, { color: colors.mutedForeground }]}>ID Pesanan</Text>
          <Text style={[styles.orderId, { color: colors.foreground }]} selectable>
            {orderId}
          </Text>
        </View>
      )}
      <View
        style={[
          styles.nextStepCard,
          {
            backgroundColor: stateBackground,
            borderColor: stateBorder,
            borderRadius: colors.radius,
          },
        ]}
      >
        <Text style={[styles.nextStepTitle, { color: stateColor }]}>
          {isDuplicate ? 'Pesanan sudah terdaftar' : 'Langkah selanjutnya'}
        </Text>
        <Text style={[styles.nextStepBody, { color: stateColor }]}>
          {isDuplicate
            ? 'Gunakan ID pesanan di atas saat memantau status atau menghubungi kami.'
            : 'Simpan ID pesanan Anda dan pastikan WhatsApp tetap aktif agar konsultan kami dapat segera menghubungi Anda.'}
        </Text>
      </View>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [
          styles.closeSuccessButton,
          { backgroundColor: pressed ? colors.secondary : colors.primary, borderRadius: colors.radius },
        ]}
        testID="close-order-success"
      >
        <Ionicons name="checkmark" size={18} color={colors.primaryForeground} />
        <Text style={[styles.closeSuccessText, { color: colors.primaryForeground }]}>Selesai</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  headerSubtitle: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
  },
  closeButton: {
    padding: 6,
    marginLeft: 8,
  },
  content: {
    padding: 20,
    paddingBottom: 30,
  },
  intro: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 6,
    fontFamily: 'Inter_600SemiBold',
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  fieldError: {
    fontSize: 11,
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 15,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
  },
  submitButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  successView: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
  },
  successBody: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  orderIdCard: {
    width: '100%',
    borderWidth: 1,
    padding: 14,
    marginTop: 20,
  },
  orderIdLabel: {
    fontSize: 11,
    marginBottom: 6,
    fontFamily: 'Inter_400Regular',
  },
  orderId: {
    fontSize: 13,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  nextStepCard: {
    width: '100%',
    borderWidth: 1,
    padding: 14,
    marginTop: 14,
  },
  nextStepTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    marginBottom: 4,
    fontFamily: 'Inter_700Bold',
  },
  nextStepBody: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  closeSuccessButton: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 22,
  },
  closeSuccessText: {
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
});