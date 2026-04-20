import Setting from "../../models/setting.js";
import handleResponse from "../../utils/helper.js";

export const getPlatformSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({});

    if (!settings) {
      settings = await Setting.create({});
    }

    return handleResponse(
      res,
      200,
      "Platform settings fetched successfully",
      settings,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updatePlatformSettings = async (req, res) => {
  try {
    const payload = req.body || {};

    const settings = await Setting.findOneAndUpdate(
      {},
      { $set: payload },
      { new: true, upsert: true },
    );

    return handleResponse(
      res,
      200,
      "Platform settings updated successfully",
      settings,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
