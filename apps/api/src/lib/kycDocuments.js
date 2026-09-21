import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  fileFilter: (req, file, done) => {
    if (!DOCUMENT_TYPES.has(file.mimetype)) return done(new Error('Choose a PDF, JPEG, or PNG document.'));
    return done(null, true);
  },
});

export function parseKycDocument(req, res, next) {
  upload.single('document')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'The verification document must be 10 MB or smaller.' });
    return res.status(400).json({ error: 'Choose one PDF, JPEG, or PNG document.' });
  });
}

function configureCloudinary() {
  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
  if (!cloud_name || !api_key || !api_secret) {
    const error = new Error('Private document uploads need Cloudinary credentials in apps/api/.env.');
    error.status = 503;
    error.expose = true;
    throw error;
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
}

function validDocumentSignature(file) {
  const b = file.buffer;
  if (file.mimetype === 'application/pdf') return b.subarray(0, 5).toString('ascii') === '%PDF-';
  if (file.mimetype === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (file.mimetype === 'image/png') return b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return false;
}

export async function uploadKycDocument(file, userId) {
  if (!file || !validDocumentSignature(file)) {
    const error = new Error('The selected file is not a valid PDF, JPEG, or PNG document.');
    error.status = 422;
    error.expose = true;
    throw error;
  }
  configureCloudinary();
  const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
  const format = file.mimetype === 'application/pdf' ? 'pdf' : file.mimetype === 'image/jpeg' ? 'jpg' : 'png';
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: `tailtribe/kyc/${userId}`,
        resource_type: resourceType,
        type: 'authenticated',
        allowed_formats: [format],
        tags: ['kyc-private'],
      }, (error, response) => error ? reject(error) : resolve(response));
      stream.end(file.buffer);
    });
    return { documentRef: result.public_id, documentResourceType: resourceType, documentFormat: result.format || format };
  } catch (cause) {
    console.error('Cloudinary private KYC upload failed:', { code: cause?.http_code || cause?.name, message: cause?.message });
    const error = new Error('Private document storage could not complete the upload. Please try again.');
    error.status = 502;
    error.expose = true;
    throw error;
  }
}

export function removeKycDocument(document) {
  if (!document?.documentRef || !process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return Promise.resolve();
  configureCloudinary();
  return cloudinary.uploader.destroy(document.documentRef, {
    resource_type: document.documentResourceType || 'image', type: 'authenticated', invalidate: true,
  });
}

export function signKycDocument(document) {
  configureCloudinary();
  return cloudinary.utils.private_download_url(document.documentRef, document.documentFormat || 'pdf', {
    resource_type: document.documentResourceType || 'raw',
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
    attachment: false,
  });
}
