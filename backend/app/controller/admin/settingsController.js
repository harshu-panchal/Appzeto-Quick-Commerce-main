import Setting from "../../models/setting.js";
import handleResponse from "../../utils/helper.js";
import { normalizeProductApprovalConfig } from "../../services/productModerationService.js";

function flattenForMongoSet(prefix, value, target) {
  if (value === undefined) return;

  const isPlainObject =
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date);

  if (!isPlainObject) {
    target[prefix] = value;
    return;
  }

  const keys = Object.keys(value);
  if (!keys.length) {
    target[prefix] = value;
    return;
  }

  for (const key of keys) {
    flattenForMongoSet(`${prefix}.${key}`, value[key], target);
  }
}

export const getPlatformSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({});

    if (!settings) {
      settings = await Setting.create({});
    }

    const result = settings?.toObject?.() || settings || {};
    result.productApproval = normalizeProductApprovalConfig(result);

    return handleResponse(
      res,
      200,
      "Platform settings fetched successfully",
      result,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updatePlatformSettings = async (req, res) => {
  try {
    const payload = req.body || {};
    const toSet = {};
    for (const [key, value] of Object.entries(payload)) {
      flattenForMongoSet(key, value, toSet);
    }

    const settings = await Setting.findOneAndUpdate(
      {},
      { $set: toSet },
      { new: true, upsert: true },
    );

    const result = settings?.toObject?.() || settings || {};
    result.productApproval = normalizeProductApprovalConfig(result);

    return handleResponse(
      res,
      200,
      "Platform settings updated successfully",
      result,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
