const crypto = require("crypto");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const getCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Faltan variables CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET.");
  }

  return { cloudName, apiKey, apiSecret };
};

const normalizeLpu = (value) => String(value || "").trim().replace(/[.,]00$/, "").replace(/[^0-9]/g, "");

const ensureImageDataUrl = (fileData) => {
  const value = String(fileData || "");
  const match = value.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("La foto debe ser una imagen JPG, PNG o WEBP valida.");
  }

  const bytes = Buffer.byteLength(match[2], "base64");
  if (bytes > MAX_IMAGE_BYTES) {
    throw new Error("La foto no puede superar 5 MB.");
  }

  return value;
};

const signCloudinaryParams = (params, apiSecret) => {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return crypto.createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
};

const uploadInternoPhoto = async ({ lpu, interno, fileData }) => {
  const normalizedLpu = normalizeLpu(lpu);
  if (!/^\d{6}$/.test(normalizedLpu)) {
    throw new Error("LPU debe tener seis cifras.");
  }

  const imageDataUrl = ensureImageDataUrl(fileData);
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `internos/${normalizedLpu}`;
  const uploadParams = {
    overwrite: "true",
    public_id: publicId,
    timestamp,
  };
  const signature = signCloudinaryParams(uploadParams, apiSecret);

  const form = new FormData();
  form.set("file", imageDataUrl);
  form.set("api_key", apiKey);
  form.set("signature", signature);
  Object.entries(uploadParams).forEach(([key, value]) => form.set(key, String(value)));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || "No se pudo subir la foto a Cloudinary.");
  }

  return {
    lpu: normalizedLpu,
    interno: String(interno || "").trim(),
    publicId: data.public_id,
    secureUrl: data.secure_url,
    version: data.version,
    bytes: data.bytes,
    format: data.format,
  };
};

module.exports = {
  uploadInternoPhoto,
};
