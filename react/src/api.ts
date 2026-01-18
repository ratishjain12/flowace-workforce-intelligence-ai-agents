import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const login = async (email: string, password: string) => {
  const res = await api.post('/auth/login', { email, password });
  localStorage.setItem('token', res.data.token);
  localStorage.setItem('user', JSON.stringify(res.data.user));
  return res.data;
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const getUser = () => {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
};

export const isLoggedIn = () => !!localStorage.getItem('token');

// Chat
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const sendChatQuery = async (
  query: string,
  conversationHistory?: ConversationMessage[]
) => {
  const res = await api.post('/chat', {
    query,
    context: {
      conversationHistory,
    },
  });
  return res.data;
};

export const getChatExamples = async () => {
  const res = await api.get('/chat/examples');
  return res.data;
};

// Classifications
export const getClassificationRules = async (limit = 50) => {
  const res = await api.get(`/classifications/rules?limit=${limit}`);
  return res.data;
};

export const classifyApp = async (appName: string) => {
  const res = await api.post('/classifications/classify', { appName });
  return res.data;
};

export const getPendingClassifications = async () => {
  const res = await api.get('/classifications/pending');
  return res.data;
};

export const approveClassification = async (
  id: string,
  options?: { overrideClassification?: string; notes?: string }
) => {
  // Always send a body object, even if empty
  const body = options || {};
  const res = await api.post(`/classifications/${id}/approve`, body);
  return res.data;
};

export const rejectClassification = async (id: string, reason: string) => {
  const res = await api.post(`/classifications/${id}/reject`, { reason });
  return res.data;
};

// Audit
export const getAuditLogs = async (limit = 20) => {
  const res = await api.get(`/audit?limit=${limit}`);
  return res.data;
};

export default api;
