import React, { useState, useMemo } from 'react';
import { 
  Stethoscope, Plus, Search, Filter, RefreshCw, 
  CheckCircle2, AlertCircle, Clock, Users, Building2,
  Edit, Trash2, Eye, X, Phone, Mail, MapPin, 
  Activity, ArrowUpDown, ChevronRight, UserCheck, AlertTriangle
} from 'lucide-react';
import { api } from '../services/api';

export default function DoctorsManagement({
  doctors = [],
  departments = [],
  queue = [],
  onRefresh,
  onCallNext,
  onComplete,
  onEmergency,
  onOpenNewToken
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name'); // name, department, status, patients, wait
  const [sortOrder, setSortOrder] = useState('asc');

  // Modals & Drawers state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [selectedDoctorForQueue, setSelectedDoctorForQueue] = useState(null);
  const [deletingDoctor, setDeletingDoctor] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    department_id: '',
    specialization: '',
    room_number: 'Room 101',
    avg_consult_time: 12.0,
    status: 'available'
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionAlert, setActionAlert] = useState(null); // { type: 'success' | 'error', message }

  const showAlert = (type, message) => {
    setActionAlert({ type, message });
    setTimeout(() => setActionAlert(null), 4000);
  };

  // Summary counts
  const totalDoctors = doctors.length;
  const availableDoctors = doctors.filter(d => d.status === 'available').length;
  const consultingDoctors = doctors.filter(d => d.status === 'busy' || (d.consulting_count && d.consulting_count > 0)).length;
  const offDutyDoctors = doctors.filter(d => d.status === 'off_duty').length;

  // Filtered & Sorted Doctors
  const filteredDoctors = useMemo(() => {
    return doctors.filter(doc => {
      const matchesSearch = !searchQuery || 
        doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.specialization && doc.specialization.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (doc.room_number && doc.room_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (doc.department && doc.department.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesDept = selectedDept === 'all' || doc.department_id === parseInt(selectedDept);
      
      const matchesStatus = selectedStatus === 'all' || 
        (selectedStatus === 'consulting' ? (doc.status === 'busy' || doc.consulting_count > 0) : doc.status === selectedStatus);

      return matchesSearch && matchesDept && matchesStatus;
    }).sort((a, b) => {
      let valA, valB;
      if (sortBy === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === 'department') {
        valA = (a.department || '').toLowerCase();
        valB = (b.department || '').toLowerCase();
      } else if (sortBy === 'status') {
        valA = a.status;
        valB = b.status;
      } else if (sortBy === 'patients') {
        valA = a.active_patient_count || a.current_patients_count || 0;
        valB = b.active_patient_count || b.current_patients_count || 0;
      } else if (sortBy === 'wait') {
        valA = a.avg_wait_minutes || 0;
        valB = b.avg_wait_minutes || 0;
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [doctors, searchQuery, selectedDept, selectedStatus, sortBy, sortOrder]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Add Doctor Form Handlers
  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      department_id: departments.length > 0 ? departments[0].id : '',
      specialization: '',
      room_number: `Room ${101 + doctors.length}`,
      avg_consult_time: 12.0,
      status: 'available'
    });
    setFormErrors({});
    setIsAddModalOpen(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Doctor name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Invalid email address format';
    }
    if (!formData.department_id) errors.department_id = 'Please select a department';
    if (!formData.room_number.trim()) errors.room_number = 'Room number is required';
    if (!formData.avg_consult_time || formData.avg_consult_time <= 0) {
      errors.avg_consult_time = 'Consultation time must be greater than 0';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveAddDoctor = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim() || null,
        department_id: parseInt(formData.department_id),
        specialization: formData.specialization.trim() || null,
        room_number: formData.room_number.trim(),
        avg_consult_time: parseFloat(formData.avg_consult_time),
        status: formData.status
      };
      await api.addDoctor(payload);
      showAlert('success', `Dr. ${formData.name} added successfully.`);
      setIsAddModalOpen(false);
      if (onRefresh) await onRefresh();
    } catch (err) {
      showAlert('error', err.message || 'Failed to add doctor');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit Doctor Handlers
  const handleOpenEditModal = (doctor) => {
    setEditingDoctor(doctor);
    setFormData({
      name: doctor.name || '',
      email: doctor.email || '',
      phone: doctor.phone || '',
      department_id: doctor.department_id || (departments.length > 0 ? departments[0].id : ''),
      specialization: doctor.specialization || '',
      room_number: doctor.room_number || 'Room 101',
      avg_consult_time: doctor.avg_consult_time || 12.0,
      status: doctor.status || 'available'
    });
    setFormErrors({});
  };

  const handleSaveEditDoctor = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim() || null,
        department_id: parseInt(formData.department_id),
        specialization: formData.specialization.trim() || null,
        room_number: formData.room_number.trim(),
        avg_consult_time: parseFloat(formData.avg_consult_time),
        status: formData.status
      };
      await api.updateDoctor(editingDoctor.id, payload);
      showAlert('success', `Details for ${formData.name} updated successfully.`);
      setEditingDoctor(null);
      if (onRefresh) await onRefresh();
    } catch (err) {
      showAlert('error', err.message || 'Failed to update doctor details');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Duty Status Toggle
  const handleQuickStatusChange = async (doctorId, newStatus) => {
    try {
      await api.updateDoctor(doctorId, { status: newStatus });
      showAlert('success', `Doctor duty status updated to ${newStatus.replace('_', ' ')}.`);
      if (onRefresh) await onRefresh();
    } catch (err) {
      showAlert('error', err.message || 'Failed to update duty status');
    }
  };

  // Safe Deactivate/Delete Doctor
  const handleConfirmDelete = async () => {
    if (!deletingDoctor) return;
    setIsSubmitting(true);
    try {
      const res = await api.deleteDoctor(deletingDoctor.id);
      showAlert('success', res.message || 'Doctor record updated.');
      setDeletingDoctor(null);
      if (onRefresh) await onRefresh();
    } catch (err) {
      showAlert('error', err.message || 'Failed to delete/deactivate doctor');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Assigned queue entries for selected doctor
  const doctorAssignedQueue = useMemo(() => {
    if (!selectedDoctorForQueue) return [];
    return queue.filter(q => {
      const isDocMatch = q.doctor_id === selectedDoctorForQueue.id || 
        (q.doctor_name && q.doctor_name.toLowerCase() === selectedDoctorForQueue.name.toLowerCase()) ||
        (!q.doctor_id && q.department_id === selectedDoctorForQueue.department_id);
      const isActive = q.status === 'waiting' || q.status === 'registered' || q.status === 'consulting' || q.status === 'in_consultation';
      return isDocMatch && isActive;
    });
  }, [queue, selectedDoctorForQueue]);

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
        
        {/* Total Doctors */}
        <div className="medical-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Doctors</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
              <Stethoscope className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{totalDoctors}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Medical Staff Roster</p>
        </div>

        {/* Available Doctors */}
        <div className="medical-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Available</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">{availableDoctors}</p>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1">Ready for Consultations</p>
        </div>

        {/* Consulting / Busy Doctors */}
        <div className="medical-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Consulting Now</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">{consultingDoctors}</p>
          <p className="text-[11px] text-amber-700 font-semibold mt-1">In Active Examination</p>
        </div>

        {/* Off Duty / Unavailable */}
        <div className="medical-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Off Duty</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-700 mt-2">{offDutyDoctors}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Shift Inactive / Break</p>
        </div>

      </div>

      {/* -------------------- 2. DIRECTORY HEADER & FILTERS -------------------- */}
      <div className="medical-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Physician Directory & Roster</h2>
            <p className="text-xs text-slate-500">
              Manage clinical duty assignments, department allocations, consultation rooms, and live queues.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onRefresh && onRefresh()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
              title="Refresh Doctors List"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Add Doctor
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
          
          {/* Search Bar */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by physician name, specialization, or room..."
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

          {/* Department Filter */}
          <div className="sm:col-span-4">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700 font-medium"
            >
              <option value="all">All Departments ({departments.length})</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>

          {/* Availability Filter */}
          <div className="sm:col-span-3">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700 font-medium"
            >
              <option value="all">All Availability</option>
              <option value="available">Available ({availableDoctors})</option>
              <option value="busy">Busy / Consulting</option>
              <option value="off_duty">Off Duty ({offDutyDoctors})</option>
            </select>
          </div>

        </div>
      </div>

      {/* -------------------- 3. DOCTORS DIRECTORY TABLE -------------------- */}
      <div className="medical-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Doctor ID</th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort('name')}>
                  <div className="flex items-center gap-1">
                    <span>Physician</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Specialization</th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort('department')}>
                  <div className="flex items-center gap-1">
                    <span>Department</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Room</th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort('status')}>
                  <div className="flex items-center gap-1">
                    <span>Status</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center cursor-pointer hover:text-slate-900" onClick={() => toggleSort('patients')}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Active Queue</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort('wait')}>
                  <div className="flex items-center gap-1">
                    <span>Avg. Wait</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDoctors.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-slate-400">
                    <Stethoscope className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                    <p className="font-bold text-slate-700">No doctors match your query</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try clearing filters or add a new doctor record.</p>
                    <button
                      onClick={handleOpenAddModal}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Doctor
                    </button>
                  </td>
                </tr>
              ) : (
                filteredDoctors.map(doc => {
                  const initials = doc.name
                    ? doc.name.replace('Dr. ', '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                    : 'DR';
                  
                  const isAvailable = doc.status === 'available';
                  const isBusy = doc.status === 'busy' || doc.consulting_count > 0;
                  const isOffDuty = doc.status === 'off_duty';

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Doctor ID */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-600 text-[11px]">
                        DOC-{String(doc.id).padStart(3, '0')}
                      </td>

                      {/* Doctor Name & Contacts */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isAvailable ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            isBusy ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {initials}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 hover:text-emerald-700 transition-colors">
                              {doc.name}
                            </p>
                            <p className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                              {doc.email && <span>{doc.email}</span>}
                              {doc.phone && <span>• {doc.phone}</span>}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Specialization */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-700">
                          {doc.specialization || `${doc.department || 'Clinical'} Specialist`}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                          <Building2 className="w-3 h-3 text-sky-600" />
                          {doc.department || 'General'}
                        </span>
                      </td>

                      {/* Room */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {doc.room_number || 'Room 101'}
                        </span>
                      </td>

                      {/* Status & Quick Toggle */}
                      <td className="py-3 px-4">
                        <select
                          value={doc.status}
                          onChange={(e) => handleQuickStatusChange(doc.id, e.target.value)}
                          className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition-colors cursor-pointer focus:outline-none ${
                            isAvailable 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                              : isBusy 
                              ? 'bg-amber-50 text-amber-800 border-amber-300' 
                              : 'bg-slate-100 text-slate-600 border-slate-300'
                          }`}
                        >
                          <option value="available">● Available</option>
                          <option value="busy">● Consulting / Busy</option>
                          <option value="off_duty">● Off Duty</option>
                        </select>
                      </td>

                      {/* Active Patient Count */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedDoctorForQueue(doc)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-xs bg-slate-100 text-slate-800 hover:bg-emerald-100 hover:text-emerald-800 transition-colors"
                          title="Click to view assigned patient queue"
                        >
                          <Users className="w-3 h-3" />
                          <span>{doc.active_patient_count ?? doc.current_patients_count ?? 0}</span>
                        </button>
                      </td>

                      {/* Average Wait Time */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 font-semibold text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{doc.avg_wait_minutes ?? Math.round(doc.avg_consult_time || 12)} min</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setSelectedDoctorForQueue(doc)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-slate-100 transition-colors"
                            title="View Doctor Queue"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(doc)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-slate-100 transition-colors"
                            title="Edit Doctor"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingDoctor(doc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Deactivate / Remove"
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

      {/* -------------------- 4. ADD DOCTOR MODAL -------------------- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Add New Physician</h3>
                  <p className="text-xs text-slate-500">Register a medical doctor into the MediWait clinical database</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAddDoctor} className="space-y-4">
              
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Jennifer Adams"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 ${
                    formErrors.name ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                  }`}
                />
                {formErrors.name && <p className="text-[11px] text-rose-500 mt-1">{formErrors.name}</p>}
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="dr.adams@mediwait.ai"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className={`w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 ${
                      formErrors.email ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                    }`}
                  />
                  {formErrors.email && <p className="text-[11px] text-rose-500 mt-1">{formErrors.email}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+1 (555) 019-4500"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Department & Room */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Assigned Department <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, department_id: e.target.value }))}
                    className={`w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 ${
                      formErrors.department_id ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                    }`}
                  >
                    <option value="">Select Department...</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                  {formErrors.department_id && <p className="text-[11px] text-rose-500 mt-1">{formErrors.department_id}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Consultation Room <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Room 104"
                    value={formData.room_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, room_number: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Specialization & Avg Consult Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Clinical Specialization</label>
                  <input
                    type="text"
                    placeholder="e.g. Pediatric Cardiology"
                    value={formData.specialization}
                    onChange={(e) => setFormData(prev => ({ ...prev, specialization: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Avg. Consultation Time (Min)</label>
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
              </div>

              {/* Initial Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Initial Duty Status</label>
                <div className="flex items-center gap-3">
                  {['available', 'busy', 'off_duty'].map(st => (
                    <label key={st} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="radio"
                        name="status"
                        value={st}
                        checked={formData.status === st}
                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="capitalize text-slate-700 font-semibold">{st.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
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
                  {isSubmitting ? 'Saving...' : 'Save Doctor'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* -------------------- 5. EDIT DOCTOR MODAL -------------------- */}
      {editingDoctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Edit Doctor Profile</h3>
                  <p className="text-xs text-slate-500">Update credentials, department allocation, and room assignments</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingDoctor(null)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditDoctor} className="space-y-4">
              
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Department & Room */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Reassign Department</label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, department_id: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Consultation Room</label>
                  <input
                    type="text"
                    value={formData.room_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, room_number: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Specialization & Avg Consult Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Specialization</label>
                  <input
                    type="text"
                    value={formData.specialization}
                    onChange={(e) => setFormData(prev => ({ ...prev, specialization: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

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
              </div>

              {/* Duty Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Duty Status</label>
                <div className="flex items-center gap-3">
                  {['available', 'busy', 'off_duty'].map(st => (
                    <label key={st} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="radio"
                        name="edit_status"
                        value={st}
                        checked={formData.status === st}
                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="capitalize text-slate-700 font-semibold">{st.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDoctor(null)}
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

      {/* -------------------- 6. ASSIGNED QUEUE DRAWER / MODAL -------------------- */}
      {selectedDoctorForQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {selectedDoctorForQueue.name} — Patient Queue
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedDoctorForQueue.department} • {selectedDoctorForQueue.room_number} • {selectedDoctorForQueue.specialization}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedDoctorForQueue(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Queue Table */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Token</th>
                    <th className="py-2.5 px-3">Patient</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Est. Wait</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {doctorAssignedQueue.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Users className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-600">No active patients in this doctor's queue</p>
                        <p className="text-[11px] mt-1">New registrations in {selectedDoctorForQueue.department} will appear here.</p>
                      </td>
                    </tr>
                  ) : (
                    doctorAssignedQueue.map(q => {
                      const isConsulting = q.status === 'consulting' || q.status === 'in_consultation';
                      const isEmergency = q.priority === 'emergency';
                      return (
                        <tr key={q.id} className={`hover:bg-slate-50/80 ${isEmergency ? 'bg-rose-50/40' : ''}`}>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{q.token_number}</td>
                          <td className="py-2.5 px-3">
                            <p className="font-bold text-slate-800">{q.patient_name}</p>
                            <p className="text-[10px] text-slate-400">{q.patient_mrn || '—'}</p>
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
                          <td className="py-2.5 px-3 font-bold text-slate-700">
                            {isConsulting ? '0 min (Active)' : `${q.estimated_wait_minutes || 10} min`}
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
                                  if (onCallNext) await onCallNext(q.id, selectedDoctorForQueue.id);
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

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-medium">
                {doctorAssignedQueue.length} patient(s) assigned in {selectedDoctorForQueue.department}
              </span>
              <button
                onClick={() => setSelectedDoctorForQueue(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Close Queue View
              </button>
            </div>

          </div>
        </div>
      )}

      {/* -------------------- 7. DELETE / DEACTIVATE CONFIRMATION MODAL -------------------- */}
      {deletingDoctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Deactivate Doctor</h3>
                <p className="text-xs text-slate-500">{deletingDoctor.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              If this doctor has active or historical patient consultation records, they will be safely marked 
              <span className="font-bold text-slate-800"> Off Duty</span> to preserve clinical visit records.
              If no consultation history exists, the doctor record will be deleted.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeletingDoctor(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
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
