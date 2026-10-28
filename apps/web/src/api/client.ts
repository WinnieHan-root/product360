import axios from "axios";
import type {
  ChannelsResponse,
  ExternalResponse,
  MetaItem,
  Overview,
  ProductListResponse,
  SessionUser,
} from "./types";

const TOKEN_KEY = "product360_token";

export const api = axios.create({ baseURL: "/api" });

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function login(email: string, password: string) {
  const { data } = await api.post<{ accessToken: string; user: SessionUser }>("/auth/login", {
    email,
    password,
  });
  setToken(data.accessToken);
  return data.user;
}

export async function fetchMe() {
  const { data } = await api.get<SessionUser>("/auth/me");
  return data;
}

export async function fetchProducts(params: Record<string, string | undefined>) {
  const { data } = await api.get<ProductListResponse>("/products", { params });
  return data;
}

export async function fetchBrands() {
  const { data } = await api.get<{ items: MetaItem[] }>("/meta/brands");
  return data.items;
}

export async function fetchCategories() {
  const { data } = await api.get<{ items: MetaItem[] }>("/meta/categories");
  return data.items;
}

export async function fetchOverview(spu: string) {
  const { data } = await api.get<Overview>(`/products/${encodeURIComponent(spu)}/overview`);
  return data;
}

export async function fetchChannels(spu: string, days = 30) {
  const { data } = await api.get<ChannelsResponse>(
    `/products/${encodeURIComponent(spu)}/channels`,
    { params: { days } },
  );
  return data;
}

export async function fetchExternal(spu: string, days = 30) {
  const { data } = await api.get<ExternalResponse>(
    `/products/${encodeURIComponent(spu)}/external`,
    { params: { days } },
  );
  return data;
}