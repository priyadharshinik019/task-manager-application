const { Readable } = require('node:stream');
const { getConfiguredCloudinary } = require('../config/cloudinary');

function createCloudinaryError() {
  const error = new Error('Cloudinary operation failed.');
  error.code = 'CLOUDINARY_OPERATION_FAILED';
  return error;
}

function uploadBuffer(cloudinary, imageBuffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          reject(createCloudinaryError());
          return;
        }

        resolve(result);
      }
    );

    Readable.from([imageBuffer]).pipe(uploadStream);
  });
}

async function uploadImage(image) {
  const cloudinary = getConfiguredCloudinary();
  let result;

  try {
    if (Buffer.isBuffer(image)) {
      result = await uploadBuffer(cloudinary, image);
    } else if (typeof image === 'string') {
      let sourceUrl;
      try {
        sourceUrl = new URL(image);
      } catch {
        const error = new Error('Image source must be a valid HTTPS URL.');
        error.code = 'INVALID_IMAGE_SOURCE';
        throw error;
      }

      if (sourceUrl.protocol !== 'https:') {
        const error = new Error('Image source must be a valid HTTPS URL.');
        error.code = 'INVALID_IMAGE_SOURCE';
        throw error;
      }

      result = await cloudinary.uploader.upload(image, { resource_type: 'image' });
    } else {
      const error = new Error('Image data is invalid.');
      error.code = 'INVALID_IMAGE_SOURCE';
      throw error;
    }
  } catch (error) {
    if (error.code === 'INVALID_IMAGE_SOURCE') {
      throw error;
    }
    throw createCloudinaryError();
  }

  if (
    typeof result.secure_url !== 'string' ||
    !result.secure_url.startsWith('https://') ||
    typeof result.public_id !== 'string' ||
    !result.public_id
  ) {
    throw createCloudinaryError();
  }

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id
  };
}

async function deleteImage(publicId) {
  const cloudinary = getConfiguredCloudinary();

  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw createCloudinaryError();
    }
  } catch {
    throw createCloudinaryError();
  }
}

module.exports = { uploadImage, deleteImage };
