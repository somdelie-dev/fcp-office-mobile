import React from "react";

import { OvertimeApprovals } from "@/components/OvertimeApprovals";
import {
  apiAdminApproveOvertime,
  apiAdminOvertimeRequests,
  apiAdminRejectOvertime,
} from "@/lib/apiClient";

const ADMIN_API = {
  list: apiAdminOvertimeRequests,
  approve: apiAdminApproveOvertime,
  reject: apiAdminRejectOvertime,
};

export default function AdminOvertimeScreen() {
  return <OvertimeApprovals api={ADMIN_API} showSiteCount />;
}
