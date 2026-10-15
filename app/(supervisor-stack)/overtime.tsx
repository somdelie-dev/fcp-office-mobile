import React from "react";

import { OvertimeApprovals } from "@/components/OvertimeApprovals";
import {
  apiSupervisorApproveOvertime,
  apiSupervisorOvertimeRequests,
  apiSupervisorRejectOvertime,
} from "@/lib/apiClient";

const SUPERVISOR_API = {
  list: apiSupervisorOvertimeRequests,
  approve: apiSupervisorApproveOvertime,
  reject: apiSupervisorRejectOvertime,
};

export default function SupervisorOvertimeScreen() {
  return <OvertimeApprovals api={SUPERVISOR_API} />;
}
