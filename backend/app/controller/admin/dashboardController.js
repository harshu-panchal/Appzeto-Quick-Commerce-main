import handleResponse from "../../utils/helper.js";
import { getAdminDashboardStats } from "../../services/admin/dashboardService.js";

export const getAdminStats = async (req, res) => {
  try {
    const stats = await getAdminDashboardStats();
    return handleResponse(res, 200, "Admin stats fetched successfully", stats);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
