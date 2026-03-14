import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : undefined);

const api = axios.create({
  baseURL: apiBaseUrl,
});

// Attach JWT token for authenticated requests.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle unauthorized responses and force re-login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Register user account.
export const registerUser = (data) => api.post('/auth/register', data);
// Login with email/password.
export const loginUser = (data) => api.post('/auth/login', data);
// Fetch authenticated user profile.
export const getMe = () => api.get('/auth/me');
// Update authenticated user profile fields.
export const updateMe = (data) => api.put('/auth/me', data);
// Update authenticated user password.
export const changePassword = (data) => api.put('/auth/me/password', data);

// Create a new group.
export const createGroup = (data) => api.post('/groups', data);
// Join an existing group via invite code.
export const joinGroup = (code) => api.post('/groups/join', { invite_code: code });
// List groups for current user.
export const getGroups = () => api.get('/groups');
// Fetch group members.
export const getMembers = (id) => api.get(`/groups/${id}/members`);

// Add expense to group.
export const addExpense = (groupId, data) => api.post(`/groups/${groupId}/expenses`, data);
// Reverse an existing expense.
export const reverseExpense = (id) => api.post(`/expenses/${id}/reverse`);
// List group expenses.
export const getExpenses = (groupId) => api.get(`/groups/${groupId}/expenses`);
// Fetch group member balances.
export const getBalances = (groupId) => api.get(`/groups/${groupId}/balances`);

// Get optimized settlement suggestions.
export const getSuggested = (groupId) => api.get(`/groups/${groupId}/settlements/suggested`);
// Create settlement and Razorpay order.
export const createSettlement = (data) => api.post('/settlements', data);

// Fetch spending analytics.
export const getSpending = (groupId) => api.get(`/groups/${groupId}/analytics/spending`);
// Fetch fairness analytics.
export const getFairness = (groupId) => api.get(`/groups/${groupId}/analytics/fairness`);
// Fetch anomaly analytics.
export const getAnomalies = (groupId) => api.get(`/groups/${groupId}/analytics/anomalies`);
// Fetch monthly trend analytics.
export const getTrends = (groupId) => api.get(`/groups/${groupId}/analytics/trends`);

// ── GPay Import API calls ───────────────────────────

/**
 * Upload GPay PDF and parse all sent transactions
 * Returns list of extracted transactions
 */
export const parseGPayPDF = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/gpay/parse-pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Upload GPay PDF with date filter applied server-side
 */
export const parseGPayPDFWithFilter = (file, fromDate, toDate) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('from_date', fromDate);
  formData.append('to_date', toDate);
  return api.post('/gpay/parse-pdf/filter', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Import selected and edited transactions as group expenses
 */
export const bulkImportGPay = (groupId, transactions) =>
  api.post('/gpay/bulk-import', {
    group_id: groupId,
    transactions,
  });

// ── Settlement payment functions ────────────────────

/** Create settlement + get Razorpay link */
export const createSettlementWithLink = (data) =>
  api.post('/settlements/create-with-link', data);

/** Confirm settlement after payment */
export const confirmSettlementManually = (id) =>
  api.post(`/settlements/${id}/confirm-manual`);

/** Get full payment history for a group */
export const getSettlementHistory = (groupId) =>
  api.get(`/groups/${groupId}/settlements/history`);

export default api;
