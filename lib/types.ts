type Role = "admin" | "staff";

type Profile = {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  role: Role;
};