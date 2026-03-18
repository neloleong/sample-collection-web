export type Role = "admin" | "staff";

export type Profile = {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  role: Role;
};