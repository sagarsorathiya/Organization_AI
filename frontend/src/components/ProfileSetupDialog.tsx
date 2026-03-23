import { useState, useEffect } from "react";
import { useOrgStore } from "@/store/orgStore";
import { useAuthStore } from "@/store/authStore";
import { Building2, Network, Award, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

export function ProfileSetupDialog() {
  const { user, checkAuth } = useAuthStore();
  const {
    companies, departments, designations,
    fetchCompanies, fetchDepartments, fetchDesignations,
    setupProfile,
  } = useOrgStore();

  const [companyId, setCompanyId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [desigId, setDesigId] = useState("");
  const [saving, setSaving] = useState(false);

  // Load active companies on mount
  useEffect(() => {
    fetchCompanies(false);
  }, [fetchCompanies]);

  // When company changes, load departments for that company
  useEffect(() => {
    if (companyId) {
      fetchDepartments(companyId, false);
      setDeptId("");
      setDesigId("");
    }
  }, [companyId, fetchDepartments]);

  // When department changes, load designations for that department
  useEffect(() => {
    if (deptId) {
      fetchDesignations(deptId, false);
      setDesigId("");
    }
  }, [deptId, fetchDesignations]);

  if (!user?.needs_profile_setup || user?.is_local_account) return null;

  const handleSubmit = async () => {
    if (!companyId || !deptId || !desigId) {
      toast.error("Please select company, department, and designation");
      return;
    }
    setSaving(true);
    try {
      await setupProfile(companyId, deptId, desigId);
      toast.success("Profile setup complete!");
      await checkAuth(); // refresh user to clear needs_profile_setup
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="card w-full max-w-md p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-3">
            <Building2 size={28} className="text-primary-600 dark:text-primary-400" />
          </div>
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-100">
            Welcome, {user?.display_name}!
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Please set up your organization profile to continue.
          </p>
        </div>

        {/* Company */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-surface-500 mb-1">
            <Building2 size={12} /> Company
          </label>
          <select
            className="input-field text-sm"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">Select a company...</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Department */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-surface-500 mb-1">
            <Network size={12} /> Department
          </label>
          <select
            className="input-field text-sm"
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            disabled={!companyId}
          >
            <option value="">{companyId ? "Select a department..." : "Select company first"}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Designation */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-surface-500 mb-1">
            <Award size={12} /> Designation
          </label>
          <select
            className="input-field text-sm"
            value={desigId}
            onChange={(e) => setDesigId(e.target.value)}
            disabled={!deptId}
          >
            <option value="">{deptId ? "Select a designation..." : "Select department first"}</option>
            {designations.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!companyId || !deptId || !desigId || saving}
          className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {saving ? "Saving..." : "Complete Setup"}
        </button>
      </div>
    </div>
  );
}
