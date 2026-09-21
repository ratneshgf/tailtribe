import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 6;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES },
  fileFilter: (req, file, done) => {
    if (!MIME_TYPES.has(file.mimetype)) return done(new Error('Unsupported photo type.'));
    return done(null, true);
  },
});

export function parsePetImages(req, res, next) {
  upload.array('images', MAX_IMAGES)(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Each photo must be 5 MB or smaller.' });
    if (error.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: 'You can add up to 6 photos.' });
    return res.status(400).json({ error: 'Photos must be JPEG, PNG, or WebP images.' });
  });
}

function configureCloudinary() {
  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
  if (!cloud_name || !api_key || !api_secret) {
    const error = new Error('Photo uploads need Cloudinary credentials in apps/api/.env.');
    error.status = 503;
    error.expose = true;
    throw error;
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
}

function validImageSignature(file) {
  const b = file.buffer;
  if (file.mimetype === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (file.mimetype === 'image/png') return b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/webp') return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

function uploadOne(file, ownerId, index) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder: `tailtribe/pets/${ownerId}`,
      resource_type: 'image',
      allowed_formats: ['jpg', 'png', 'webp'],
      transformation: [{ width: 1800, height: 1800, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }],
      tags: ['pet-listing'],
    }, (error, result) => {
      if (error) return reject(error);
      resolve({ storageKey: result.public_id, url: result.secure_url, type: 'image', sortOrder: index });
    });
    stream.end(file.buffer);
  });
}

export async function removePetImages(media = []) {
  if (!media.length || !process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return;
  configureCloudinary();
  await Promise.allSettled(media.map(({ storageKey }) => cloudinary.uploader.destroy(storageKey, { resource_type: 'image', invalidate: true })));
}

export async function uploadPetImages(files = [], ownerId) {
  if (!files.length) return [];
  configureCloudinary();
  if (files.some((file) => !validImageSignature(file))) {
    const error = new Error('One of the selected files is not a valid JPEG, PNG, or WebP image.');
    error.status = 422;
    error.expose = true;
    throw error;
  }
  const uploaded = [];
  try {
    for (const [index, file] of files.entries()) uploaded.push(await uploadOne(file, ownerId, index));
    return uploaded;
  } catch (cause) {
    const code = Number(cause?.http_code || cause?.error?.http_code);
    console.error('Cloudinary pet photo upload failed:', { code: code || cause?.name, message: cause?.message });
    await removePetImages(uploaded);
    const message = code === 401
      ? 'Cloudinary rejected the API credentials. Check that the API key and secret match this cloud.'
      : code === 403
        ? 'This Cloudinary API key may not have permission to upload images. Check its access role.'
        : code === 400
          ? 'Cloudinary rejected the image or upload settings. Try a JPEG, PNG, or WebP photo under 5 MB.'
          : 'Cloudinary could not finish the upload. Check the API terminal for the provider error.';
    const error = new Error(message);
    error.status = 502;
    error.expose = true;
    throw error;
  }
}
