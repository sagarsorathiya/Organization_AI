import { useState, useEffect, useCallback } from "react";
import type { Company, Department, Designation } from "@/types";
import { useOrgStore } from "@/store/orgStore";
import {
  Building2, Network, Award, Plus, Trash2, Edit3, Save, X, Loader2,
  ToggleLeft, ToggleRight, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

type Section = "companies" | "departments" | "designations";

/* ─── Shared: Status Badge ─── */
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
      active
        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
        : "bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-surface-400"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

/* ─── Shared: Empty State ─── */
function EmptyState({ icon: Icon, label, buttonLabel }: { icon: React.ElementType; label: string; buttonLabel: string }) {
  return (
    <div className="text-center py-12 space-y-3">
      <Icon size={40} className="mx-auto text-surface-300 dark:text-surface-600" />
      <p className="text-sm text-surface-400">No {label} yet</p>
      <p className="text-xs text-surface-400">Click "{buttonLabel}" to create one</p>
    </div>
  );
}

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

  const sections = [
    { id: "companies" as Section, label: "Companies", icon: Building2, count: companies.length },
    { id: "departments" as Section, label: "Departments", icon: Network, count: departments.length },
    { id: "designations" as Section, label: "Designations", icon: Award, count: designations.length },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-surface-200 dark:border-surface-700">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              section === s.id
                ? "border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
            }`}
          >
            <s.icon size={15} />
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
          departments={departments}
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
          designations={designations}
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
  companies, departments, onCreate, onUpdate, onDelete, onRefresh,
}: {
  companies: Company[];
  departments: Department[];
  onCreate: (d: Partial<Company>) => Promise<Company>;
  onUpdate: (id: string, d: Partial<Company>) => Promise<Company>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Partial<Company> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const toggleActive = async (c: Company) => {
    try {
      await onUpdate(c.id, { is_active: !c.is_active });
      toast.success(`${c.name} ${c.is_active ? "deactivated" : "activated"}`);
      await onRefresh();
    } catch {
      toast.error("Failed to toggle status");
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
        <div className="card p-5 border-2 border-primary-200 dark:border-primary-800 space-y-4">
          <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-200 flex items-center gap-2">
            <Building2 size={15} />
            {isNew ? "New Company" : "Edit Company"}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Name *</label>
              <input
                className="input w-full"
                value={editing.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Acme Corporation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Code *</label>
              <input
                className="input w-full"
                value={editing.code || ""}
                onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                placeholder="ACME"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Description</label>
            <input
              className="input w-full"
              value={editing.description || ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>
          {!isNew && (
            <label className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="rounded" />
              Active
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2">
              <Save size={14} /> {isNew ? "Create" : "Save Changes"}
            </button>
            <button onClick={() => { setEditing(null); setIsNew(false); }} className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-2">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {companies.map((c) => {
          const deptNames = departments.filter((d) => d.company_ids.includes(c.id));
          const isExpanded = expandedId === c.id;
          return (
            <div key={c.id} className="card overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`p-2 rounded-lg ${c.is_active ? "bg-primary-100 dark:bg-primary-900/30" : "bg-surface-100 dark:bg-surface-800"}`}>
                    <Building2 size={18} className={c.is_active ? "text-primary-600 dark:text-primary-400" : "text-surface-400"} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-surface-800 dark:text-surface-100">{c.name}</span>
                      <span className="text-xs font-mono bg-surface-100 dark:bg-surface-700 px-1.5 py-0.5 rounded">{c.code}</span>
                      <StatusBadge active={c.is_active} />
                    </div>
                    {c.description && <p className="text-xs text-surface-400 mt-0.5 truncate">{c.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  {deptNames.length > 0 && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      className="btn-ghost p-1.5 text-surface-400 hover:text-surface-600 flex items-center"
                      title={`${deptNames.length} departments`}
                    >
                      <Network size={14} />
                      <span className="text-xs ml-1">{deptNames.length}</span>
                      {isExpanded ? <ChevronDown size={12} className="ml-0.5" /> : <ChevronRight size={12} className="ml-0.5" />}
                    </button>
                  )}
                  <button onClick={() => toggleActive(c)} className="btn-ghost p-1.5" title={c.is_active ? "Deactivate" : "Activate"}>
                    {c.is_active ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} className="text-surface-400" />}
                  </button>
                  <button onClick={() => { setEditing(c); setIsNew(false); }} className="btn-ghost p-1.5" title="Edit">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {isExpanded && deptNames.length > 0 && (
                <div className="px-4 pb-3 pt-0">
                  <div className="flex flex-wrap gap-1.5 pl-10">
                    {deptNames.map((d) => (
                      <span key={d.id} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                        <Network size={10} className="inline mr-1" />{d.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {companies.length === 0 && <EmptyState icon={Building2} label="companies" buttonLabel="Add Company" />}
      </div>
    </div>
  );
}

/* ─── Department Section ─── */

function DepartmentSection({
  departments, companies, designations, onCreate, onUpdate, onDelete, onRefresh,
}: {
  departments: Department[];
  companies: Company[];
  designations: Designation[];
  onCreate: (d: Partial<Department> & { company_ids?: string[] }) => Promise<Department>;
  onUpdate: (id: string, d: Partial<Department> & { company_ids?: string[] }) => Promise<Department>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<(Partial<Department> & { company_ids?: string[] }) | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const toggleActive = async (d: Department) => {
    try {
      await onUpdate(d.id, { is_active: !d.is_active });
      toast.success(`${d.name} ${d.is_active ? "deactivated" : "activated"}`);
      await onRefresh();
    } catch {
      toast.error("Failed to toggle status");
    }
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
        <div className="card p-5 border-2 border-primary-200 dark:border-primary-800 space-y-4">
          <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-200 flex items-center gap-2">
            <Network size={15} />
            {isNew ? "New Department" : "Edit Department"}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Name *</label>
              <input className="input w-full" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Engineering" />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Code *</label>
              <input className="input w-full" value={editing.code || ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="ENG" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Description</label>
            <input className="input w-full" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Optional description" />
          </div>
          {companies.length > 0 && (
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1.5 block">Map to Companies</label>
              <div className="flex flex-wrap gap-2">
                {companies.filter((c) => c.is_active).map((c) => {
                  const selected = (editing.company_ids || []).includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCompany(c.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        selected
                          ? "bg-primary-500 dark:bg-primary-600 border-primary-500 text-white shadow-sm"
                          : "border-surface-200 dark:border-surface-600 text-surface-500 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400"
                      }`}
                    >
                      <Building2 size={10} className="inline mr-1" />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!isNew && (
            <label className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="rounded" />
              Active
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2">
              <Save size={14} /> {isNew ? "Create" : "Save Changes"}
            </button>
            <button onClick={() => { setEditing(null); setIsNew(false); }} className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-2">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {departments.map((d) => {
          const compNames = companies.filter((c) => d.company_ids.includes(c.id));
          const desigNames = designations.filter((des) => des.department_ids.includes(d.id));
          const isExpanded = expandedId === d.id;
          return (
            <div key={d.id} className="card overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`p-2 rounded-lg ${d.is_active ? "bg-blue-100 dark:bg-blue-900/30" : "bg-surface-100 dark:bg-surface-800"}`}>
                    <Network size={18} className={d.is_active ? "text-blue-600 dark:text-blue-400" : "text-surface-400"} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-surface-800 dark:text-surface-100">{d.name}</span>
                      <span className="text-xs font-mono bg-surface-100 dark:bg-surface-700 px-1.5 py-0.5 rounded">{d.code}</span>
                      <StatusBadge active={d.is_active} />
                    </div>
                    {compNames.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {compNames.map((c) => (
                          <span key={c.id} className="text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded">
                            <Building2 size={9} className="inline mr-0.5" />{c.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  {desigNames.length > 0 && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : d.id)}
                      className="btn-ghost p-1.5 text-surface-400 hover:text-surface-600 flex items-center"
                      title={`${desigNames.length} designations`}
                    >
                      <Award size={14} />
                      <span className="text-xs ml-1">{desigNames.length}</span>
                      {isExpanded ? <ChevronDown size={12} className="ml-0.5" /> : <ChevronRight size={12} className="ml-0.5" />}
                    </button>
                  )}
                  <button onClick={() => toggleActive(d)} className="btn-ghost p-1.5" title={d.is_active ? "Deactivate" : "Activate"}>
                    {d.is_active ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} className="text-surface-400" />}
                  </button>
                  <button onClick={() => { setEditing({ ...d }); setIsNew(false); }} className="btn-ghost p-1.5" title="Edit">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDelete(d.id)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {isExpanded && desigNames.length > 0 && (
                <div className="px-4 pb-3 pt-0">
                  <div className="flex flex-wrap gap-1.5 pl-10">
                    {desigNames.map((des) => (
                      <span key={des.id} className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                        <Award size={10} className="inline mr-1" />{des.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {departments.length === 0 && <EmptyState icon={Network} label="departments" buttonLabel="Add Department" />}
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

  const toggleActive = async (d: Designation) => {
    try {
      await onUpdate(d.id, { is_active: !d.is_active });
      toast.success(`${d.name} ${d.is_active ? "deactivated" : "activated"}`);
      await onRefresh();
    } catch {
      toast.error("Failed to toggle status");
    }
  };

  const levelGroups = [...new Set(designations.map((d) => d.level))].sort((a, b) => a - b);

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
        <div className="card p-5 border-2 border-primary-200 dark:border-primary-800 space-y-4">
          <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-200 flex items-center gap-2">
            <Award size={15} />
            {isNew ? "New Designation" : "Edit Designation"}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Name *</label>
              <input className="input w-full" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Senior Engineer" />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Code *</label>
              <input className="input w-full" value={editing.code || ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="SR-ENG" />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Level</label>
              <input className="input w-full" type="number" min="0" value={editing.level ?? 0} onChange={(e) => setEditing({ ...editing, level: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Description</label>
            <input className="input w-full" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Optional description" />
          </div>
          {departments.length > 0 && (
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1.5 block">Map to Departments</label>
              <div className="flex flex-wrap gap-2">
                {departments.filter((d) => d.is_active).map((d) => {
                  const selected = (editing.department_ids || []).includes(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggleDepartment(d.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        selected
                          ? "bg-primary-500 dark:bg-primary-600 border-primary-500 text-white shadow-sm"
                          : "border-surface-200 dark:border-surface-600 text-surface-500 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400"
                      }`}
                    >
                      <Network size={10} className="inline mr-1" />
                      {d.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!isNew && (
            <label className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="rounded" />
              Active
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2">
              <Save size={14} /> {isNew ? "Create" : "Save Changes"}
            </button>
            <button onClick={() => { setEditing(null); setIsNew(false); }} className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-2">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {levelGroups.map((level) => {
          const items = designations.filter((d) => d.level === level);
          return (
            <div key={level}>
              {levelGroups.length > 1 && (
                <p className="text-xs font-medium text-surface-400 uppercase tracking-wider mt-3 mb-1.5">Level {level}</p>
              )}
              {items.map((d) => {
                const deptNames = departments.filter((dep) => d.department_ids.includes(dep.id));
                return (
                  <div key={d.id} className="card p-4 flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg ${d.is_active ? "bg-amber-100 dark:bg-amber-900/30" : "bg-surface-100 dark:bg-surface-800"}`}>
                        <Award size={18} className={d.is_active ? "text-amber-600 dark:text-amber-400" : "text-surface-400"} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-surface-800 dark:text-surface-100">{d.name}</span>
                          <span className="text-xs font-mono bg-surface-100 dark:bg-surface-700 px-1.5 py-0.5 rounded">{d.code}</span>
                          <span className="text-xs text-surface-400">Lv.{d.level}</span>
                          <StatusBadge active={d.is_active} />
                        </div>
                        {deptNames.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {deptNames.map((dep) => (
                              <span key={dep.id} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                                <Network size={9} className="inline mr-0.5" />{dep.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <button onClick={() => toggleActive(d)} className="btn-ghost p-1.5" title={d.is_active ? "Deactivate" : "Activate"}>
                        {d.is_active ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} className="text-surface-400" />}
                      </button>
                      <button onClick={() => { setEditing({ ...d }); setIsNew(false); }} className="btn-ghost p-1.5" title="Edit">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => handleDelete(d.id)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {designations.length === 0 && <EmptyState icon={Award} label="designations" buttonLabel="Add Designation" />}
      </div>
    </div>
  );
}
