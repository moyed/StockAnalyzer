import api from "./api";

export async function login(email: string, password: string) {
  const { data } = await api.post("/login", { email, password });
  localStorage.setItem("token", data.token);
  return data.user;
}

export async function register(name: string, email: string, password: string, password_confirmation: string) {
  const { data } = await api.post("/register", { name, email, password, password_confirmation });
  localStorage.setItem("token", data.token);
  return data.user;
}

export async function logout() {
  await api.post("/logout").catch(() => {});
  localStorage.removeItem("token");
}

export function isLoggedIn() {
  return typeof window !== "undefined" && !!localStorage.getItem("token");
}
