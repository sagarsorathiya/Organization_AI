import { useState, useEffect, useCallback } from "react";
import type { Company, Department, Designation } from "@/types";
import { useOrgStore } from "@/store/orgStore";
import {
  Building2, Network, Award, Plus, Trash2, Edit3, Save, X, Loader2,
  Link2,
} from "lucide-react";
import { toast } from "sonner";

type Section = "companies" | "departments" | "designations";

export function OrganizationAdmin() {
  const [section, setSection] = useState<Section>("companies");
  const {
    companies, departments, designations, loading,
    fetchCompanies, fetchDepartments, fetchDesignations,
    createCompany, updateCompany, deleteCompany,
    createDepartment, updateDepartment, deleteDepartment,
    createDesignation, updateDesignation, deleteDesignation,
  } = useOrgStore();

  const loadAll = useCallback(async () => {
    await Promise.all([
      fetchCompanies(true),
      fetchDepartments(undefined, true),
      fetchDesignations(undefined, true),
    ]);
  }, [fetchCompanies, fetchDepartments, fetchDesignations]);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-surface-200 dark:border-surface-700">
        {([
          { id: "companies" as Section, label: "Companies", icon: Building2, count: companies.length },
          { id: "departments" as Section, label: "Departments", icon: Network, count: departments.length },
          { id: "designations" as Section, label: "Designations", icon: Award, count: designations.length },
        ]).map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              section === s.id
                ? "border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
            }`}
          >
            <s.icon size={14} />
            {s.label}
            <span className="ml-1 text-xs bg-surface-100 dark:bg-surface-700 px-1.5 py-0.5 rounded-full">
              {s.count}
            </span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-primary-500" size={24} />
        </div>
      )}

      {!loading && section === "companies" && (
        <CompanySection
          companies={companies}
          onCreate={createCompany}
          onUpdate={updateCompany}
          onDelete={deleteCompany}
          onRefresh={loadAll}
        />
      )}

      {!loading && section === "departments" && (
        <DepartmentSection
          departments={departments}
          companies={companies}
          onCreate={createDepartment}
          onUpdate={updateDepartment}
          onDelete={deleteDepartment}
          onRefresh={loadAll}
        />
      )}

      {!loading && section === "designations" && (
        <DesignationSection
          designations={designations}
          departments={departments}
          onCreate={createDesignation}
          onUpdate={updateDesignation}
          onDelete={deleteDesignation}
          onRefresh={loadAll}
        />
      )}
    </div>
  );
}

/* ─── Company Section ─── */

function CompanySection({
  companies, onCreate, onUpdate, onDelete, onRefresh,
}: {
  companies: Company[];
  onCreate: (d: Partial<Company>) => Promise<Company>;
  onUpdate: (id: string, d: Partial<Company>) => Promise<Company>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Partial<Company> | null>(null);
  const [isNew, setIsNew] = useState(false);

  const handleSave = async () => {
    if (!editing?.name || !editing?.code) {
      toast.error("Name and code are required");
      return;
    }
    try {
      if (isNew) {
        await onCreate(editing);
        toast.success("Company created");
      } else if (editing.id) {
        await onUpdate(editing.id, editing);
        toast.success("Company updated");
      }
      setEditing(null);
      setIsNew(false);
      await onRefresh();
    } catch {
      toast.error("Failed to save company");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this company? Users assigned to it will be unlinked.")) return;
    try {
      await onDelete(id);
      toast.success("Company deleted");
      await onRefresh();
    } catch {
      toast.error("Failed to delete company");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-surface-400">Manage companies in your organization</p>
        <button
          onClick={() => { setEditing({ name: "", code: "", description: "", is_active: true }); setIsNew(true); }}
          className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5"
        >
          <Plus size={14} /> Add Company
        </button>
      </div>

      {editing && (
        <div className="card p-4 border-2 border-primary-200 dark:border-primary-800 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-surface-500">Name *</label>
              <input
                className="input mt-1"
                value={editing.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Acme Corporation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500">Code *</label>
              <input
                className="input mt-1"
                value={editing.code || ""}
                onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                placeholder="ACME"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500">Description</label>
            <input
              className="input mt-1"
              value={editing.description || ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5">
              <Save size={14} /> {isNew ? "Create" : "Update"}
            </button>
            <button onClick={() => { setEditing(null); setIsNew(false); }} className="btn-ghost text-sm px-3 py-1.5">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {companies.map((c) => (
          <div key={c.id} className="card p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 size={16} className={c.is_active ? "text-green-500" : "text-surface-400"} />
              <div>
                <span className="font-medium text-sm">{c.name}</span>
                <span className="ml-2 text-xs bg-surface-100 dark:bg-surface-700 px-1.5 py-0.5 rounded">{c.code}</span>
                {c.description && <p className="text-xs text-surface-400 mt-0.5">{c.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-surface-400">
                <Link2 size={12} className="inline mr-1" />{c.department_ids.length} depts
              </span>
              <button onClick={() => { setEditing(c); setIsNew(false); }} className="btn-ghost p-1.5">
                <Edit3 size={14} />
              </button>
              <button onClick={() => handleDelete(c.id)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {companies.length === 0 && (
          <p className="text-sm text-surface-400 text-center py-8">No companies yet. Click "Add Company" to create one.</p>
        )}
      </div>
    </div>
  );
}

/* ─── Department Section ─── */

function DepartmentSection({
  departments, companies, onCreate, onUpdate, onDelete, onRefresh,
}: {
  departments: Department[];
  companies: Company[];
  onCreate: (d: Partial<Department> & { company_ids?: string[] }) => Promise<Department>;
  onUpdate: (id: string, d: Partial<Department> & { company_ids?: string[] }) => Promise<Department>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<(Partial<Department> & { company_ids?: string[] }) | null>(null);
  const [isNew, setIsNew] = useState(false);

  const handleSave = async () => {
    if (!editing?.name || !editing?.code) {
      toast.error("Name and code are required");
      return;
    }
    try {
      if (isNew) {
        await onCreate(editing);
        toast.success("Department created");
      } else if (editing.id) {
        await onUpdate(editing.id, editing);
        toast.success("Department updated");
      }
      setEditing(null);
      setIsNew(false);
      await onRefresh();
    } catch {
      toast.error("Failed to save department");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this department?")) return;
    try {
      await onDelete(id);
      toast.success("Department deleted");
      await onRefresh();
    } catch {
      toast.error("Failed to delete department");
    }
  };

  const toggleCompany = (companyId: string) => {
    if (!editing) return;
    const ids = editing.company_ids || [];
    const next = ids.includes(companyId)
      ? ids.filter((i) => i !== companyId)
      : [...ids, companyId];
    setEditing({ ...editing, company_ids: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-surface-400">Manage departments — map to multiple companies</p>
        <button
          onClick={() => { setEditing({ name: "", code: "", description: "", is_active: true, company_ids: [] }); setIsNew(true); }}
          className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5"
        >
          <Plus size={14} /> Add Department
        </button>
      </div>

      {editing && (
        <div className="card p-4 border-2 border-primary-200 dark:border-primary-800 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-surface-500">Name *</label>
              <input className="input mt-1" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Engineering" />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500">Code *</label>
              <input className="input mt-1" value={editing.code || ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="ENG" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500">Description</label>
            <input className="input mt-1" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          {companies.length > 0 && (
            <div>
              <label className="text-xs font-medium text-surface-500">Companies</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {companies.filter((c) => c.is_active).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleCompany(c.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      (editing.company_ids || []).includes(c.id)
                        ? "bg-primary-100 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300"
                        : "border-surface-200 dark:border-surface-600 text-surface-500 hover:border-surface-400"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5">
              <Save size={14} /> {isNew ? "Create" : "Update"}
            </button>
            <button onClick={() => { setEditing(null); setIsNew(false); }} className="btn-ghost text-sm px-3 py-1.5">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {departments.map((d) => (
          <div key={d.id} className="card p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Network size={16} className={d.is_active ? "text-blue-500" : "text-surface-400"} />
              <div>
                <span className="font-medium text-sm">{d.name}</span>
                <span className="ml-2 text-xs bg-surface-100 dark:bg-surface-700 px-1.5 py-0.5 rounded">{d.code}</span>
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {d.company_ids.map((cid) => {
                    const comp = companies.find((c) => c.id === cid);
                    return comp ? (
                      <span key={cid} className="text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded">
                        {comp.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-surface-400">
                <Link2 size={12} className="inline mr-1" />{d.designation_ids.length} desig
              </span>
              <button onClick={() => { setEditing({ ...d }); setIsNew(false); }} className="btn-ghost p-1.5">
                <Edit3 size={14} />
              </button>
              <button onClick={() => handleDelete(d.id)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {departments.length === 0 && (
          <p className="text-sm text-surface-400 text-center py-8">No departments yet. Click "Add Department" to create one.</p>
        )}
      </div>
    </div>
  );
}

/* ─── Designation Section ─── */

function DesignationSection({
  designations, departments, onCreate, onUpdate, onDelete, onRefresh,
}: {
  designations: Designation[];
  departments: Department[];
  onCreate: (d: Partial<Designation> & { department_ids?: string[] }) => Promise<Designation>;
  onUpdate: (id: string, d: Partial<Designation> & { department_ids?: string[] }) => Promise<Designation>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<(Partial<Designation> & { department_ids?: string[] }) | null>(null);
  const [isNew, setIsNew] = useState(false);

  const handleSave = async () => {
    if (!editing?.name || !editing?.code) {
      toast.error("Name and code are required");
      return;
    }
    try {
      if (isNew) {
        await onCreate(editing);
        toast.success("Designation created");
      } else if (editing.id) {
        await onUpdate(editing.id, editing);
        toast.success("Designation updated");
      }
      setEditing(null);
      setIsNew(false);
      await onRefresh();
    } catch {
      toast.error("Failed to save designation");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this designation?")) return;
    try {
      await onDelete(id);
      toast.success("Designation deleted");
      await onRefresh();
    } catch {
      toast.error("Failed to delete designation");
    }
  };

  const toggleDepartment = (deptId: string) => {
    if (!editing) return;
    const ids = editing.department_ids || [];
    const next = ids.includes(deptId)
      ? ids.filter((i) => i !== deptId)
      : [...ids, deptId];
    setEditing({ ...editing, department_ids: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-surface-400">Manage designations — map to multiple departments</p>
        <button
          onClick={() => { setEditing({ name: "", code: "", description: "", level: 0, is_active: true, department_ids: [] }); setIsNew(true); }}
          className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5"
        >
          <Plus size={14} /> Add Designation
        </button>
      </div>

      {editing && (
        <div className="card p-4 border-2 border-primary-200 dark:border-primary-800 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-surface-500">Name *</label>
              <input className="input mt-1" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Senior Engineer" />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500">Code *</label>
              <input className="input mt-1" value={editing.code || ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="SR-ENG" />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500">Level</label>
              <input className="input mt-1" type="number" value={editing.level ?? 0} onChange={(e) => setEditing({ ...editing, level: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500">Description</label>
            <input className="input mt-1" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          {departments.length > 0 && (
            <div>
              <label className="text-xs font-medium text-surface-500">Departments</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {departments.filter((d) => d.is_active).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleDepartment(d.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      (editing.department_ids || []).includes(d.id)
                        ? "bg-primary-100 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300"
                        : "border-surface-200 dark:border-surface-600 text-surface-500 hover:border-surface-400"
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5">
              <Save size={14} /> {isNew ? "Create" : "Update"}
            </button>
            <button onClick={() => { setEditing(null); setIsNew(false); }} className="btn-ghost text-sm px-3 py-1.5">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {designations.map((d) => (
          <div key={d.id} className="card p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Award size={16} className={d.is_active ? "text-amber-500" : "text-surface-400"} />
              <div>
                <span className="font-medium text-sm">{d.name}</span>
                <span className="ml-2 text-xs bg-surface-100 dark:bg-surface-700 px-1.5 py-0.5 rounded">{d.code}</span>
                <span className="ml-2 text-xs text-surface-400">Level {d.level}</span>
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {d.department_ids.map((did) => {
                    const dept = departments.find((dep) => dep.id === did);
                    return dept ? (
                      <span key={did} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                        {dept.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => { setEditing({ ...d }); setIsNew(false); }} className="btn-ghost p-1.5">
                <Edit3 size={14} />
              </button>
              <button onClick={() => handleDelete(d.id)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {designations.length === 0 && (
          <p className="text-sm text-surface-400 text-center py-8">No designations yet. Click "Add Designation" to create one.</p>
        )}
      </div>
    </div>
  );
}
