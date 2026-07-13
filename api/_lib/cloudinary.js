const crypto = require("crypto");

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

const signCloudinaryParams = (params, apiSecret) => {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return crypto.createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
};

const createInternoPhotoUploadSignature = ({ lpu, interno }) => {
  const normalizedLpu = normalizeLpu(lpu);
  if (!/^\d{6}$/.test(normalizedLpu)) {
    throw new Error("LPU debe tener seis cifras.");
  }

  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `internos/${normalizedLpu}`;
  const uploadParams = {
    overwrite: "true",
    public_id: publicId,
    timestamp,
  };
  const signature = signCloudinaryParams(uploadParams, apiSecret);

  return {
    lpu: normalizedLpu,
    interno: String(interno || "").trim(),
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    fields: {
      ...uploadParams,
      api_key: apiKey,
      signature,
    },
  };
};

module.exports = {
  createInternoPhotoUploadSignature,
};
