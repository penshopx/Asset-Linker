export const MAX_PROOF_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

// Inspect bytes, never trust the filename or the multipart Content-Type alone.
function contentMime(buffer: Buffer): string | null {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    return "application/pdf";
  }
  return null;
}

export function validatePaymentProof(file: Express.Multer.File):
  | { error: string; status: number }
  | { mime: string; extension: string } {
  if (file.size > MAX_PROOF_BYTES) {
    return { status: 413, error: "Ukuran bukti pembayaran maksimal 10 MB." };
  }
  if (file.size === 0) {
    return { status: 400, error: "Bukti pembayaran kosong. Pilih berkas lain." };
  }
  const extension = file.originalname.split(".").pop()?.toLowerCase() ?? "";
  const expectedMime = MIME_BY_EXTENSION[extension];
  const declaredMime = file.mimetype.toLowerCase();
  const detectedMime = contentMime(file.buffer);
  if (
    !expectedMime ||
    detectedMime !== expectedMime ||
    (declaredMime !== "application/octet-stream" && declaredMime !== expectedMime)
  ) {
    return {
      status: 400,
      error: "Gunakan berkas JPG, PNG, atau PDF dengan ekstensi, MIME, dan isi berkas yang sesuai.",
    };
  }
  return { mime: detectedMime, extension };
}
