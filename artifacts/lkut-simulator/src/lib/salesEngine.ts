import { LkutFormData } from '@/types/lkut';

const BASE = 'https://bayar.gustafta.my.id/p';

type Jenjang = '7' | '8' | '9';

function getJenjang(kualifikasi: string): Jenjang {
  if (kualifikasi === 'Kecil') return '7';
  if (kualifikasi === 'Menengah') return '8';
  return '9'; // Besar, BUJKA, dll.
}

export interface ProductLink {
  label: string;
  href: string;
  primary?: boolean;
}

export interface TriggerAlert {
  id: 'skk' | 'smap' | 'alat' | 'tkk';
  severity: 'critical' | 'warning';
  title: string;
  body: string;
  products: ProductLink[];
}

export function getSalesAlerts(
  data: LkutFormData,
  indicatorScores: Record<string, number>
): TriggerAlert[] {
  const alerts: TriggerAlert[] = [];
  const jenjang = getJenjang(data.kualifikasi ?? 'Menengah');
  const jenjangLabel = jenjang === '7' ? '7 (Kecil)' : jenjang === '8' ? '8 (Menengah)' : '9 (Besar)';

  // ─── Trigger 1: SKK Kritis ─────────────────────────────────────────────────
  const skkExpiring = data.skkMonthsLeft !== undefined && data.skkMonthsLeft !== null && data.skkMonthsLeft <= 3;
  const certScoreLow = (indicatorScores['certificates'] ?? 100) < 50;
  if (skkExpiring || certScoreLow) {
    alerts.push({
      id: 'skk',
      severity: 'critical',
      title: '⚠️ SKK Anda Dalam Mode Darurat!',
      body: skkExpiring
        ? `SKK Anda hanya tersisa ${data.skkMonthsLeft} bulan lagi! Mengikuti webinar atau LMS memakan waktu berminggu-minggu. Amankan poin PKB Anda sekarang dengan solusi terima beres.`
        : 'Skor sertifikasi Anda rendah. Tambah poin PKB sekarang untuk menghindari risiko gagal perpanjangan SKK.',
      products: [
        {
          label: `Paket Tuntas SKK Jenjang ${jenjangLabel}`,
          href: `${BASE}/paket-tuntas-pkb-skk-jenjang-${jenjang}`,
          primary: true,
        },
        {
          label: 'Solusi Last Minute — Rp 350rb',
          href: `${BASE}/exec-summary-pkb-siap-perpanjangan-skk`,
        },
      ],
    });
  }

  // ─── Trigger 2: SBU Terancam / Butuh SMAP ─────────────────────────────────
  if (data.hasSmap === false) {
    alerts.push({
      id: 'smap',
      severity: 'critical',
      title: '🚨 SBU Anda Terancam Dibekukan!',
      body: 'Tanpa dokumen SMAP (Anti Penyuapan ISO 37001), SBU Anda dapat dibekukan oleh LPJK. Sanksi administratif ini nyata dan aktif diberlakukan — jangan tunda lebih lama.',
      products: [
        {
          label: 'Jasa Kilat Dokumen SMAP — SBU Emergency',
          href: `${BASE}/jasa-kilat-dokumen-smap-sbu-emergency`,
          primary: true,
        },
        {
          label: 'Paket Sertifikasi ISO 37001 Non-KAN',
          href: `${BASE}/paket-sertifikasi-iso-37001-non-kan`,
        },
        {
          label: 'Template SMAP ISO 37001 (Lebih Hemat)',
          href: `${BASE}/template-smap-iso-37001`,
        },
      ],
    });
  }

  // ─── Trigger 3: Masalah Peralatan / SIMPK ─────────────────────────────────
  const equipLow =
    (indicatorScores['equipmentRatio'] ?? 100) < 60 ||
    (indicatorScores['equipmentNewness'] ?? 100) < 60;

  if (equipLow) {
    const sewaMap: Record<string, ProductLink> = {
      Kecil:   { label: 'Sewa Peralatan SBU Kecil — 3 Tahun',        href: `${BASE}/sewa-peralatan-sbu-kecil-3-tahun` },
      Menengah:{ label: 'Sewa Peralatan SBU Menengah — 3 Tahun',     href: `${BASE}/sewa-peralatan-sbu-menengah-3-tahun` },
      Besar:   { label: 'Sewa Peralatan SBU Besar/PMA — 3 Tahun',    href: `${BASE}/sewa-peralatan-sbu-besar-pma-3-tahun` },
      BUJKA:   { label: 'Sewa Peralatan SBU BUJKA/Asing — 3 Tahun',  href: `${BASE}/sewa-peralatan-sbu-bujka-asing-3-tahun` },
    };
    const sewa = sewaMap[data.kualifikasi ?? 'Menengah'] ?? sewaMap['Menengah'];

    alerts.push({
      id: 'alat',
      severity: 'warning',
      title: '🔧 Peralatan Kurang — Risiko Ditolak Verifier SIMPK',
      body: 'Rasio atau kebaruan peralatan Anda di bawah standar minimum. Verifier SIMPK akan menolak pendaftaran SBU jika alat tidak memenuhi persyaratan.',
      products: [
        {
          label: 'Cheat Sheet Alat SBU Murah + Panduan SIMPK',
          href: `${BASE}/database-peralatan-minimalis-sbu`,
          primary: true,
        },
        {
          label: 'Jasa Input & Verifikasi SIMPK Per Alat',
          href: `${BASE}/jasa-input-verifikasi-simpk-per-alat`,
        },
        sewa,
      ],
    });
  }

  // ─── Trigger 4: Butuh Tenaga Ahli / SKK untuk SBU & Tender ───────────────
  const hrLow =
    (indicatorScores['hrProductivity'] ?? 100) < 60 ||
    (indicatorScores['hrEmpowerment'] ?? 100) < 60;

  if (hrLow) {
    alerts.push({
      id: 'tkk',
      severity: 'warning',
      title: '👷 Butuh Tenaga Ahli Bersertifikat SKK?',
      body: 'Skor SDM Anda rendah. Untuk perpanjangan SBU dan tender proyek, Anda memerlukan TKK bersertifikat yang terkunci di perusahaan selama 3 tahun.',
      products: [
        {
          label: `Freelance TKK Jenjang ${jenjangLabel} — Lock SBU 3 Tahun`,
          href: `${BASE}/jasa-freelance-tkk-jenjang-${jenjang}-sbu-3-tahun`,
          primary: true,
        },
        {
          label: 'Jasa Mediator Tenaga Ahli — Tender/Proyek Mendadak',
          href: `${BASE}/jasa-mediator-tenaga-ahli-freelance`,
        },
      ],
    });
  }

  return alerts;
}
