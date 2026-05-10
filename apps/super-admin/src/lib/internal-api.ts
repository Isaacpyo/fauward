import axios from "axios";
import { getCsrfToken } from "./auth";

export const internalApi = axios.create({
  baseURL: "/api/internal",
  withCredentials: true,
});

internalApi.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase();
  if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});
