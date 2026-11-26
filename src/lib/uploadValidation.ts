import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const MAX_INSPECTION_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const INSPECTIONS_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'inspections');

export function ensureUploadDirectory(): void {
  fs.mkdirSync(INSPECTIONS_UPLOAD_DIR, { recursive: true });
}

export function detectImageMimeFromMagicBytes(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function validateAndSaveUploadedImage(
  rawBase64OrDataUrl: string,
  declaredMime?: string
): {
  buffer: Buffer;
  base64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  fileName: string;
  fileSizeBytes: number;
} {
  let cleanBase64 = rawBase64OrDataUrl.trim();
  let prefixMime = declaredMime || '';

  if (cleanBase64.includes(',')) {
    const [prefix, raw] = cleanBase64.split(',', 2);
    cleanBase64 = raw || '';
    const match = prefix.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64$/);
    if (match) prefixMime = match[1];
  }

  if (!cleanBase64) {
    throw new Error('Image payload is empty.');
  }

  // Approximate decoded byte length check before full decode
  const estimatedBytes = Math.floor((cleanBase64.length * 3) / 4);
  if (estimatedBytes > MAX_INSPECTION_IMAGE_BYTES + 1024) {
    throw new Error('Uploaded image exceeds the 5 MB safety limit.');
  }

  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_INSPECTION_IMAGE_BYTES) {
    throw new Error('Uploaded image must be non-empty and under 5 MB.');
  }

  const detectedMime = detectImageMimeFromMagicBytes(buffer);
  if (!detectedMime || !ALLOWED_IMAGE_MIME_TYPES.has(detectedMime)) {
    throw new Error('Unsupported or invalid image binary. Allowed formats: PNG, JPEG, WEBP.');
  }
  if (prefixMime && prefixMime !== 'image/jpg' && prefixMime !== detectedMime) {
    // Allow image/jpeg even if declared image/jpg, otherwise require match
    if (!(prefixMime === 'image/jpg' && detectedMime === 'image/jpeg')) {
      throw new Error('Image MIME type does not match file signature.');
    }
  }

  ensureUploadDirectory();
  const ext = detectedMime === 'image/png' ? 'png' : detectedMime === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `insp_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const targetPath = path.resolve(INSPECTIONS_UPLOAD_DIR, fileName);
  if (!targetPath.startsWith(INSPECTIONS_UPLOAD_DIR + path.sep)) {
    throw new Error('Invalid storage path.');
  }

  fs.writeFileSync(targetPath, buffer);

  return {
    buffer,
    base64: buffer.toString('base64'),
    mimeType: detectedMime,
    fileName,
    fileSizeBytes: buffer.length,
  };
}

export function resolveSafeUploadedImagePath(fileName: string): string | null {
  if (!/^[a-zA-Z0-9_.-]+$/.test(fileName)) return null;
  const resolved = path.resolve(INSPECTIONS_UPLOAD_DIR, fileName);
  if (!resolved.startsWith(INSPECTIONS_UPLOAD_DIR + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}
