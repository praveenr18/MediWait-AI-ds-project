const API_BASE = "http://localhost:8000/api";

export async function fetchApi(endpoint, options = {}) {
  const token = localStorage.getItem("mediwait_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Network error" }));
      throw new Error(err.detail || `Request failed with status ${res.status}`);
    }

    // Handle CSV or file downloads
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("text/csv")) {
      return res.blob();
    }

    return await res.json();
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error);
    throw error;
  }
}

export const api = {
  // Auth & Roles
  getDemoUsers: () => fetchApi("/auth/demo-users"),
  switchRole: (userId) => fetchApi(`/auth/switch-role/${userId}`, { method: "POST" }),
  login: (data) => fetchApi("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  register: (data) => fetchApi("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  getMe: () => fetchApi("/auth/me"),

  // Queue
  getQueue: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/queue${query ? `?${query}` : ""}`);
  },
  getMyToken: (tokenNumber) => {
    const query = tokenNumber ? `?token_number=${tokenNumber}` : "";
    return fetchApi(`/queue/my-token${query}`);
  },
  getDepartmentsWaitTimes: () => fetchApi("/queue/departments"),
  registerPatient: (data) => fetchApi("/queue/register", { method: "POST", body: JSON.stringify(data) }),
  callNext: (id, docId) => fetchApi(`/queue/${id}/call-next${docId ? `?doctor_id=${docId}` : ""}`, { method: "POST" }),
  completeConsultation: (id) => fetchApi(`/queue/${id}/complete`, { method: "POST" }),
  markEmergency: (id) => fetchApi(`/queue/${id}/emergency`, { method: "POST" }),
  cancelQueueEntry: (id) => fetchApi(`/queue/${id}/cancel`, { method: "POST" }),
  recalculateQueue: () => fetchApi("/queue/recalculate", { method: "POST" }),

  // Predictions & Explainability
  predictWaitTime: (data) => fetchApi("/predict", { method: "POST", body: JSON.stringify(data) }),
  getModelMetrics: () => fetchApi("/predict/metrics"),
  explainTokenWait: (tokenOrId) => fetchApi(`/predict/explain/${tokenOrId}`),
  simulateScenario: (data) => fetchApi("/predict/simulate", { method: "POST", body: JSON.stringify(data) }),

  // Analytics & Forecasts
  getKPIs: () => fetchApi("/analytics/kpis"),
  getWaitingTrend: () => fetchApi("/analytics/waiting-trend"),
  getDepartmentDistribution: () => fetchApi("/analytics/department-distribution"),
  getWaitingByDepartment: () => fetchApi("/analytics/waiting-by-department"),
  getDoctorWorkload: () => fetchApi("/analytics/doctor-workload"),
  getPeakHeatmap: () => fetchApi("/analytics/peak-heatmap"),
  getForecasting: () => fetchApi("/analytics/forecasting"),
  getRecommendations: () => fetchApi("/analytics/recommendations"),

  // Management & Administration
  getDoctors: () => fetchApi("/doctors"),
  addDoctor: (data) => fetchApi("/doctors", { method: "POST", body: JSON.stringify(data) }),
  updateDoctor: (id, data) => fetchApi(`/doctors/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getDepartments: () => fetchApi("/departments"),
  createDepartment: (data) => fetchApi("/departments", { method: "POST", body: JSON.stringify(data) }),
  getAlerts: () => fetchApi("/alerts"),
  resolveAlert: (id) => fetchApi(`/alerts/${id}/resolve`, { method: "POST" }),
  getFeedback: () => fetchApi("/feedback"),
  submitFeedback: (data) => fetchApi("/feedback", { method: "POST", body: JSON.stringify(data) }),
  getNotifications: (userId) => fetchApi(`/notifications${userId ? `?user_id=${userId}` : ""}`),
  markAllNotificationsRead: () => fetchApi("/notifications/read-all", { method: "POST" }),
  getReportsSummary: () => fetchApi("/reports"),
  exportReportsCsv: () => fetchApi("/reports/export"),
};
