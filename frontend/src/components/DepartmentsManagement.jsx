import React, { useState, useMemo } from 'react';
import { 
  Building2, Plus, Search, Filter, RefreshCw, 
  CheckCircle2, AlertCircle, Clock, Users, Stethoscope,
  Edit, Trash2, Eye, X, UserPlus, AlertTriangle, ArrowUpDown,
  BarChart3, Activity, ShieldCheck
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, Legend 
} from 'recharts';
import { api } from '../services/api';

export default function DepartmentsManagement({
  departments = [],
  doctors = [],
  queue = [],
  onRefresh,
  onCallNext,
  onComplete,
  onEmergency,
  onOpenNewToken
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all'); // all, Normal, Moderate, High, Inactive
  const [sortBy, setSortBy] = useState('name'); // name, code, doctors, waiting, wait
  const [sortOrder, setSortOrder] = useState('asc');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [selectedDeptForQueue, setSelectedDeptForQueue] = useState(null);
  const [reassigningDept, setReassigningDept] = useState(null);
  const [deactivatingDept, setDeactivatingDept] = useState(null);

  // Reassignment selected doctors state
  const [selectedDoctorIds, setSelectedDoctorIds] = useState([]);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    avg_consult_time: 12.0,
    is_active: true
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionAlert, setActionAlert] = useState(null);

  const showAlert = (type, message) => {
    setActionAlert({ type, message });
    setTimeout(() => setActionAlert(null), 4000);
  };

  // 1. Summary Metrics
  const totalDepartments = departments.length;
  
  const totalActiveDoctors = useMemo(() => {
    return doctors.filter(d => d.status !== 'off_duty').length;
  }, [doctors]);

  const totalPatientsWaiting = useMemo(() => {
    return queue.filter(q => q.status === 'waiting' || q.status === 'registered').length;
  }, [queue]);

  const highLoadDeptCount = useMemo(() => {
    return departments.filter(d => {
      const wait = d.avg_wait_minutes ?? 0;
      const opStatus = d.operational_status || '';
      return wait > 25 || opStatus === 'High' || opStatus === 'Elevated';
    }).length;
  }, [departments]);

  // Chart comparison data (Average wait and patient load per department)
  const chartData = useMemo(() => {
    return departments.map(d => {
      // Get real-time stats from queue if available
      const deptWaiting = queue.filter(q => q.department_id === d.id && (q.status === 'waiting' || q.status === 'registered')).length;
      const deptConsulting = queue.filter(q => q.department_id === d.id && (q.status === 'consulting' || q.status === 'in_consultation')).length;
      
      return {
        name: d.name,
        code: d.code,
        avgWait: d.avg_wait_minutes ?? Math.round(d.avg_consult_time || 12),
        waiting: deptWaiting > 0 ? deptWaiting : (d.waiting_count ?? 0),
        consulting: deptConsulting > 0 ? deptConsulting : (d.consulting_count ?? 0),
        doctors: d.assigned_doctors_count ?? (d.doctors ? d.doctors.length : 0)
      };
    });
  }, [departments, queue]);

  // Filtered and sorted departments
  const filteredDepartments = useMemo(() => {
    return departments.filter(d => {
      const matchesSearch = !searchQuery ||
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.description && d.description.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesStatus = true;
      if (selectedStatusFilter === 'Inactive') {
        matchesStatus = d.is_active === false;
      } else if (selectedStatusFilter !== 'all') {
        matchesStatus = d.operational_status === selectedStatusFilter || 
          (selectedStatusFilter === 'High' && (d.operational_status === 'Elevated' || (d.avg_wait_minutes || 0) > 25));
      }

      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      let valA, valB;
      if (sortBy === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === 'code') {
        valA = a.code.toLowerCase();
        valB = b.code.toLowerCase();
      } else if (sortBy === 'doctors') {
        valA = a.assigned_doctors_count ?? (a.doctors?.length || 0);
        valB = b.assigned_doctors_count ?? (b.doctors?.length || 0);
      } else if (sortBy === 'waiting') {
        valA = a.waiting_count ?? 0;
        valB = b.waiting_count ?? 0;
      } else if (sortBy === 'wait') {
        valA = a.avg_wait_minutes ?? 0;
        valB = b.avg_wait_minutes ?? 0;
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [departments, searchQuery, selectedStatusFilter, sortBy, sortOrder]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Add Department Handlers
  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      avg_consult_time: 12.0,
      is_active: true
    });
    setFormErrors({});
    setIsAddModalOpen(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Department name is required';
    if (!formData.code.trim()) {
      errors.code = 'Department code is required (e.g. CARD)';
    } else if (formData.code.trim().length > 6) {
      errors.code = 'Code must be 6 characters or less';
    }
    if (!formData.avg_consult_time || formData.avg_consult_time <= 0) {
      errors.avg_consult_time = 'Average consultation time must be greater than 0';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveAddDept = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim() || null,
        avg_consult_time: parseFloat(formData.avg_consult_time)
      };
      await api.createDepartment(payload);
      showAlert('success', `Department "${payload.name}" created successfully.`);
      setIsAddModalOpen(false);
      if (onRefresh) await onRefresh();
    } catch (err) {
      showAlert('error', err.message || 'Failed to create department');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit Department Handlers
  const handleOpenEditModal = (dept) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name || '',
      code: dept.code || '',
      description: dept.description || '',
      avg_consult_time: dept.avg_consult_time || 12.0,
      is_active: dept.is_active !== false
    });
    setFormErrors({});
  };

  const handleSaveEditDept = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim(),
        avg_consult_time: parseFloat(formData.avg_consult_time),
        is_active: formData.is_active
      };
      await api.updateDepartment(editingDept.id, payload);
      showAlert('success', `Department "${payload.name}" updated successfully.`);
      setEditingDept(null);
      if (onRefresh) await onRefresh();
    } catch (err) {
      showAlert('error', err.message || 'Failed to update department');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reassign Doctors Handlers
  const handleOpenReassignModal = (dept) => {
    setReassigningDept(dept);
    // Pre-select doctors currently assigned to this department
    const currentlyAssigned = doctors.filter(d => d.department_id === dept.id).map(d => d.id);
    setSelectedDoctorIds(currentlyAssigned);
  };

  const handleToggleDoctorSelection = (docId) => {
    setSelectedDoctorIds(prev => 
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const handleSaveReassignment = async () => {
    if (!reassigningDept) return;
    setIsSubmitting(true);
    try {
      await api.reassignDoctors(reassigningDept.id, selectedDoctorIds);
      showAlert('success', `Doctors roster for ${reassigningDept.name} updated successfully.`);
      setReassigningDept(null);
      if (onRefresh) await onRefresh();
    } catch (err) {
      showAlert('error', err.message || 'Failed to reassign doctors');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe Deactivate / Delete Handler
  const handleConfirmDeactivate = async () => {
    if (!deactivatingDept) return;
    setIsSubmitting(true);
    try {
      const res = await api.deleteDepartment(deactivatingDept.id);
      showAlert('success', res.message || 'Department updated.');
      setDeactivatingDept(null);
      if (onRefresh) await onRefresh();
    } catch (err) {
      showAlert('error', err.message || 'Failed to deactivate department');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Department Assigned Queue
  const departmentAssignedQueue = useMemo(() => {
    if (!selectedDeptForQueue) return [];
    return queue.filter(q => {
      const isDept = q.department_id === selectedDeptForQueue.id;
      const isActive = q.status === 'waiting' || q.status === 'registered' || q.status === 'consulting' || q.status === 'in_consultation';
      return isDept && isActive;
    });
  }, [queue, selectedDeptForQueue]);

  return (
    <div className="space-y-6">

      {/* Global Alert Notification */}
      {actionAlert && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-xs font-bold transition-all shadow-sm ${
          actionAlert.type === 'error' ? 'bg-rose-50 border border-rose-200 text-rose-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
        }`}>
          <div className="flex items-center gap-2">
            {actionAlert.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{actionAlert.message}</span>
          </div>
          <button onClick={() => setActionAlert(null)} className="hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* -------------------- 1. SUMMARY CARDS -------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        {/* Total Departments */}
        <div className="medical-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Departments</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{totalDepartments}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Clinical Specialties</p>
        </div>

        {/* Total Active Doctors */}
        <div className="medical-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active Doctors</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
              <Stethoscope className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-sky-600 mt-2">{totalActiveDoctors}</p>
          <p className="text-[11px] text-sky-700 font-semibold mt-1">Available or Consulting</p>
        </div>

        {/* Patients Waiting */}
        <div className="medical-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Patients Waiting</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">{totalPatientsWaiting}</p>
          <p className="text-[11px] text-amber-700 font-semibold mt-1">Live Queue Across Hospital</p>
        </div>

        {/* High Load Departments */}
        <div className="medical-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">High Queue Load</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
              highLoadDeptCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-2xl font-black mt-2 ${highLoadDeptCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {highLoadDeptCount}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Wait Time &gt; 25 Minutes</p>
        </div>

      </div>

      {/* -------------------- 2. RECHARTS: DEPARTMENT WAITING-TIME COMPARISON -------------------- */}
      <div className="medical-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              Department Waiting Time & Active Patient Comparison
            </h2>
            <p className="text-xs text-slate-500">
              Live waiting time metrics (minutes) and waiting queue volume across clinical departments
            </p>
          </div>
          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
            ML Inferred &amp; Telemetry
          </span>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  borderRadius: '12px', 
                  border: 'none', 
                  color: '#fff', 
                  fontSize: '11px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(val, name) => [
                  name === 'avgWait' ? `${val} minutes` : `${val} patients`,
                  name === 'avgWait' ? 'Avg. Predicted Wait' : 'Patients Waiting'
                ]}
                labelFormatter={(label) => {
                  const match = chartData.find(d => d.code === label);
                  return match ? `${match.name} (${label})` : label;
                }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                formatter={(val) => val === 'avgWait' ? 'Avg. Wait Time (Min)' : 'Waiting Patients'}
              />
              <Bar dataKey="avgWait" fill="#0284c7" radius={[6, 6, 0, 0]} maxBarSize={36} />
              <Bar dataKey="waiting" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* -------------------- 3. DIRECTORY HEADER & FILTERS -------------------- */}
      <div className="medical-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Department Directory</h2>
            <p className="text-xs text-slate-500">
              Department operational statuses, doctor allocations, and capacity management.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onRefresh && onRefresh()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
              title="Refresh Departments List"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Add Department
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
          
          {/* Search Bar */}
          <div className="sm:col-span-8 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search departments by name, code, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Operational Status Filter */}
          <div className="sm:col-span-4">
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700 font-medium"
            >
              <option value="all">All Operational Statuses</option>
              <option value="Normal">Normal Flow</option>
              <option value="Moderate">Moderate Flow</option>
              <option value="High">High / Elevated Queue</option>
              <option value="Inactive">Inactive / Suspended</option>
            </select>
          </div>

        </div>
      </div>

      {/* -------------------- 4. DEPARTMENTS DIRECTORY TABLE -------------------- */}
      <div className="medical-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort('code')}>
                  <div className="flex items-center gap-1">
                    <span>Code</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort('name')}>
                  <div className="flex items-center gap-1">
                    <span>Department</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort('doctors')}>
                  <div className="flex items-center gap-1">
                    <span>Assigned Doctors</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center cursor-pointer hover:text-slate-900" onClick={() => toggleSort('waiting')}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Waiting</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">Consulting</th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort('wait')}>
                  <div className="flex items-center gap-1">
                    <span>Avg. Wait</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDepartments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-400">
                    <Building2 className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                    <p className="font-bold text-slate-700">No departments match your query</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try clearing filters or add a new clinical department.</p>
                    <button
                      onClick={handleOpenAddModal}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Department
                    </button>
                  </td>
                </tr>
              ) : (
                filteredDepartments.map(dept => {
                  const deptWait = dept.avg_wait_minutes ?? Math.round(dept.avg_consult_time || 12);
                  const isHigh = deptWait > 25 || dept.operational_status === 'High' || dept.operational_status === 'Elevated';
                  const isModerate = deptWait > 15 && !isHigh;
                  const isInactive = dept.is_active === false;

                  const assignedCount = dept.assigned_doctors_count ?? (dept.doctors ? dept.doctors.length : 0);
                  const activeWaitCount = queue.filter(q => q.department_id === dept.id && (q.status === 'waiting' || q.status === 'registered')).length || dept.waiting_count || 0;
                  const activeConsultCount = queue.filter(q => q.department_id === dept.id && (q.status === 'consulting' || q.status === 'in_consultation')).length || dept.consulting_count || 0;

                  return (
                    <tr key={dept.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Code */}
                      <td className="py-3 px-4 font-mono font-extrabold text-emerald-800 text-xs">
                        <span className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                          {dept.code}
                        </span>
                      </td>

                      {/* Name & Description */}
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-bold text-slate-900">{dept.name}</p>
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                            {dept.description || 'Clinical outpatient department'}
                          </p>
                        </div>
                      </td>

                      {/* Assigned Doctors */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenReassignModal(dept)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 hover:bg-sky-100 hover:text-sky-800 transition-colors"
                            title="Click to view or reassign doctors"
                          >
                            <Stethoscope className="w-3 h-3 text-sky-600" />
                            <span>{assignedCount} Doctor{assignedCount === 1 ? '' : 's'}</span>
                          </button>
                        </div>
                      </td>

                      {/* Patients Waiting */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedDeptForQueue(dept)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                          title="Click to view active waiting queue"
                        >
                          <Users className="w-3 h-3" />
                          <span>{activeWaitCount}</span>
                        </button>
                      </td>

                      {/* Patients Consulting */}
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-emerald-800 bg-emerald-50">
                          {activeConsultCount}
                        </span>
                      </td>

                      {/* Average Wait Time */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 font-semibold text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{deptWait} min</span>
                        </div>
                      </td>

                      {/* Operational Status */}
                      <td className="py-3 px-4">
                        {isInactive ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                            Inactive
                          </span>
                        ) : isHigh ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            High Load
                          </span>
                        ) : isModerate ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            Moderate
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Normal Flow
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setSelectedDeptForQueue(dept)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-slate-100 transition-colors"
                            title="View Department Queue"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenReassignModal(dept)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-slate-100 transition-colors"
                            title="Assign / Reassign Doctors"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(dept)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-slate-100 transition-colors"
                            title="Edit Department Details"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeactivatingDept(dept)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Deactivate / Remove Department"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------- 5. ADD DEPARTMENT MODAL -------------------- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Add Clinical Department</h3>
                  <p className="text-xs text-slate-500">Configure department codes, consultation times, and specialties</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAddDept} className="space-y-4">
              
              {/* Department Name & Code */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Department Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Neurology"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className={`w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 ${
                      formErrors.name ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                    }`}
                  />
                  {formErrors.name && <p className="text-[11px] text-rose-500 mt-1">{formErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="NEURO"
                    maxLength={6}
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 ${
                      formErrors.code ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                    }`}
                  />
                  {formErrors.code && <p className="text-[11px] text-rose-500 mt-1">{formErrors.code}</p>}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Clinical Scope & Description</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Comprehensive brain, nervous system, and neurovascular assessment..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Consultation Time */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Baseline Consultation Duration (Minutes)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="120"
                  value={formData.avg_consult_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, avg_consult_time: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Department'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* -------------------- 6. EDIT DEPARTMENT MODAL -------------------- */}
      {editingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Edit Department Details</h3>
                  <p className="text-xs text-slate-500">{editingDept.name} ({editingDept.code})</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingDept(null)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditDept} className="space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Department Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Avg Consult Time (Min)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.avg_consult_time}
                    onChange={(e) => setFormData(prev => ({ ...prev, avg_consult_time: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <span>Department Active in Intake</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDept(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Updating...' : 'Save Changes'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* -------------------- 7. REASSIGN DOCTORS MODAL -------------------- */}
      {reassigningDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Assign Physicians to {reassigningDept.name}
                  </h3>
                  <p className="text-xs text-slate-500">Select doctors to allocate to this department's clinical queue</p>
                </div>
              </div>
              <button 
                onClick={() => setReassigningDept(null)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Check the doctors who should be actively assigned to <span className="font-bold text-slate-700">{reassigningDept.name}</span>.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-72">
              {doctors.map(doc => {
                const isSelected = selectedDoctorIds.includes(doc.id);
                const currentDept = departments.find(d => d.id === doc.department_id);
                return (
                  <label
                    key={doc.id}
                    onClick={() => handleToggleDoctorSelection(doc.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-emerald-500 bg-emerald-50/60 text-emerald-950 font-semibold' 
                        : 'border-slate-200 bg-slate-50 hover:bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                      />
                      <div>
                        <p className="font-bold text-slate-900">{doc.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {doc.specialization} • Currently in: {currentDept ? currentDept.name : 'Unassigned'}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] bg-white border px-2 py-0.5 rounded text-slate-500">
                      {doc.room_number || 'Room 101'}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-medium">
                {selectedDoctorIds.length} doctor(s) allocated
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReassigningDept(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveReassignment}
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Apply Doctor Allocation'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* -------------------- 8. DEPARTMENT QUEUE MODAL -------------------- */}
      {selectedDeptForQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {selectedDeptForQueue.name} ({selectedDeptForQueue.code}) — Active Queue
                  </h3>
                  <p className="text-xs text-slate-500">
                    Baseline consult: {selectedDeptForQueue.avg_consult_time} min • Active intake queue
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedDeptForQueue(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Token</th>
                    <th className="py-2.5 px-3">Patient</th>
                    <th className="py-2.5 px-3">Attending Doctor</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {departmentAssignedQueue.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Users className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-600">No active patients in {selectedDeptForQueue.name}</p>
                        <p className="text-[11px] mt-1">Register a patient to assign them to this queue.</p>
                      </td>
                    </tr>
                  ) : (
                    departmentAssignedQueue.map(q => {
                      const isConsulting = q.status === 'consulting' || q.status === 'in_consultation';
                      const isEmergency = q.priority === 'emergency';
                      return (
                        <tr key={q.id} className={`hover:bg-slate-50/80 ${isEmergency ? 'bg-rose-50/40' : ''}`}>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{q.token_number}</td>
                          <td className="py-2.5 px-3">
                            <p className="font-bold text-slate-800">{q.patient_name}</p>
                            <p className="text-[10px] text-slate-400">{q.patient_mrn || '—'}</p>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {q.doctor_name || 'Next Available'}
                          </td>
                          <td className="py-2.5 px-3">
                            {isEmergency ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">
                                Emergency
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Normal</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isConsulting ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isConsulting ? 'Consulting' : 'Waiting'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isConsulting ? (
                              <button
                                onClick={async () => {
                                  if (onComplete) await onComplete(q.id);
                                  if (onRefresh) await onRefresh();
                                }}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                              >
                                Complete
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
                                  if (onCallNext) await onCallNext(q.id);
                                  if (onRefresh) await onRefresh();
                                }}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors"
                              >
                                Call Next
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-medium">
                {departmentAssignedQueue.length} patient(s) currently in this department
              </span>
              <button
                onClick={() => setSelectedDeptForQueue(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Close Queue View
              </button>
            </div>

          </div>
        </div>
      )}

      {/* -------------------- 9. DEACTIVATE CONFIRMATION MODAL -------------------- */}
      {deactivatingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Deactivate Department</h3>
                <p className="text-xs text-slate-500">{deactivatingDept.name} ({deactivatingDept.code})</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              If this department has clinical consultation history or assigned doctors, it will be safely 
              <span className="font-bold text-slate-800"> Deactivated</span> to prevent data loss and preserve records.
              If no visits or doctor records exist, the department will be deleted.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeactivatingDept(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeactivate}
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Processing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
