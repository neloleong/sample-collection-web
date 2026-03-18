export function normalizeRole(role: any): "admin" | "staff" {
  const r = (role || "").toLowerCase().trim();
  return r === "admin" ? "admin" : "staff";
}