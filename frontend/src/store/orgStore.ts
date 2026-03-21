import { create } from "zustand";
import type { Company, Department, Designation } from "@/types";
import { get, post, put, del } from "@/api/client";

interface OrgState {
  companies: Company[];
  departments: Department[];
  designations: Designation[];
  loading: boolean;

  // Load lists (admin gets all, user gets active only)
  fetchCompanies: (admin?: boolean) => Promise<void>;
  fetchDepartments: (companyId?: string, admin?: boolean) => Promise<void>;
  fetchDesignations: (departmentId?: string, admin?: boolean) => Promise<void>;

  // Admin CRUD — companies
  createCompany: (data: Partial<Company>) => Promise<Company>;
  updateCompany: (id: string, data: Partial<Company>) => Promise<Company>;
  deleteCompany: (id: string) => Promise<void>;

  // Admin CRUD — departments
  createDepartment: (data: Partial<Department> & { company_ids?: string[] }) => Promise<Department>;
  updateDepartment: (id: string, data: Partial<Department> & { company_ids?: string[] }) => Promise<Department>;
  deleteDepartment: (id: string) => Promise<void>;

  // Admin CRUD — designations
  createDesignation: (data: Partial<Designation> & { department_ids?: string[] }) => Promise<Designation>;
  updateDesignation: (id: string, data: Partial<Designation> & { department_ids?: string[] }) => Promise<Designation>;
  deleteDesignation: (id: string) => Promise<void>;

  // M2M mapping
  setCompanyDepartments: (companyId: string, deptIds: string[]) => Promise<void>;
  setDepartmentDesignations: (deptId: string, desigIds: string[]) => Promise<void>;

  // User profile
  setupProfile: (companyId: string, deptId: string, desigId: string) => Promise<void>;
  updateProfile: (companyId: string, deptId: string, desigId: string) => Promise<void>;
}

export const useOrgStore = create<OrgState>((set, _get) => ({
  companies: [],
  departments: [],
  designations: [],
  loading: false,

  fetchCompanies: async (admin = false) => {
    set({ loading: true });
    try {
      const prefix = admin ? "/admin/organization" : "/organization";
      const res = await get<{ companies: Company[] }>(`${prefix}/companies`);
      set({ companies: res.companies });
    } finally {
      set({ loading: false });
    }
  },

  fetchDepartments: async (companyId?: string, admin = false) => {
    set({ loading: true });
    try {
      const prefix = admin ? "/admin/organization" : "/organization";
      const qs = companyId ? `?company_id=${companyId}` : "";
      const res = await get<{ departments: Department[] }>(`${prefix}/departments${qs}`);
      set({ departments: res.departments });
    } finally {
      set({ loading: false });
    }
  },

  fetchDesignations: async (departmentId?: string, admin = false) => {
    set({ loading: true });
    try {
      const prefix = admin ? "/admin/organization" : "/organization";
      const qs = departmentId ? `?department_id=${departmentId}` : "";
      const res = await get<{ designations: Designation[] }>(`${prefix}/designations${qs}`);
      set({ designations: res.designations });
    } finally {
      set({ loading: false });
    }
  },

  // ── Companies ──
  createCompany: async (data) => {
    const res = await post<Company>("/admin/organization/companies", data);
    set((s) => ({ companies: [...s.companies, res] }));
    return res;
  },
  updateCompany: async (id, data) => {
    const res = await put<Company>(`/admin/organization/companies/${id}`, data);
    set((s) => ({ companies: s.companies.map((c) => (c.id === id ? res : c)) }));
    return res;
  },
  deleteCompany: async (id) => {
    await del(`/admin/organization/companies/${id}`);
    set((s) => ({ companies: s.companies.filter((c) => c.id !== id) }));
  },

  // ── Departments ──
  createDepartment: async (data) => {
    const res = await post<Department>("/admin/organization/departments", data);
    set((s) => ({ departments: [...s.departments, res] }));
    return res;
  },
  updateDepartment: async (id, data) => {
    const res = await put<Department>(`/admin/organization/departments/${id}`, data);
    set((s) => ({ departments: s.departments.map((d) => (d.id === id ? res : d)) }));
    return res;
  },
  deleteDepartment: async (id) => {
    await del(`/admin/organization/departments/${id}`);
    set((s) => ({ departments: s.departments.filter((d) => d.id !== id) }));
  },

  // ── Designations ──
  createDesignation: async (data) => {
    const res = await post<Designation>("/admin/organization/designations", data);
    set((s) => ({ designations: [...s.designations, res] }));
    return res;
  },
  updateDesignation: async (id, data) => {
    const res = await put<Designation>(`/admin/organization/designations/${id}`, data);
    set((s) => ({ designations: s.designations.map((d) => (d.id === id ? res : d)) }));
    return res;
  },
  deleteDesignation: async (id) => {
    await del(`/admin/organization/designations/${id}`);
    set((s) => ({ designations: s.designations.filter((d) => d.id !== id) }));
  },

  // ── M2M ──
  setCompanyDepartments: async (companyId, deptIds) => {
    await put(`/admin/organization/companies/${companyId}/departments`, { ids: deptIds });
  },
  setDepartmentDesignations: async (deptId, desigIds) => {
    await put(`/admin/organization/departments/${deptId}/designations`, { ids: desigIds });
  },

  // ── User profile ──
  setupProfile: async (companyId, deptId, desigId) => {
    await post("/organization/profile-setup", {
      company_id: companyId,
      department_id: deptId,
      designation_id: desigId,
    });
  },
  updateProfile: async (companyId, deptId, desigId) => {
    const { patch } = await import("@/api/client");
    await patch("/organization/profile", {
      company_id: companyId,
      department_id: deptId,
      designation_id: desigId,
    });
  },
}));
