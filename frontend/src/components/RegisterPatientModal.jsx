import React, { useState, useEffect } from 'react';
import { X, UserPlus, AlertCircle, Clock, HeartPulse, UserCheck } from 'lucide-react';

export default function RegisterPatientModal({ isOpen, onClose, departments = [], currentUser, onRegistered }) {
  const [formData, setFormData] = useState({
    patient_name: '',
    phone: '',
    age: 35,
    gender: 'Male',
    department_id: departments[0]?.id || 1,
    priority: 'normal',
    reason: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      const isPatient = currentUser?.role === 'patient';
      setFormData({
        patient_name: isPatient && currentUser?.full_name ? currentUser.full_name : '',
        phone: isPatient && currentUser?.phone ? currentUser.phone : '',
        age: 35,
        gender: 'Male',
        department_id: departments[0]?.id || 1,
        priority: 'normal',
        reason: ''
      });
    }
  }, [isOpen, currentUser, departments]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!formData.patient_name || !formData.phone) {
      setError("Please fill in patient name and mobile number.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onRegistered({
        ...formData,
        age: parseInt(formData.age),
        department_id: parseInt(formData.department_id)
      });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to register patient");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-sky-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserPlus className="w-5 h-5" />
            <h3 className="text-base font-bold">Register Patient / New Token</h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Patient Full Name</label>
            <input 
              type="text"
              required
              value={formData.patient_name}
              onChange={e => setFormData({ ...formData, patient_name: e.target.value })}
              placeholder="e.g. Eleanor Vance"
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number</label>
              <input 
                type="tel"
                required
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="e.g. 9876543210"
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Age</label>
              <input 
                type="number"
                min="1"
                max="120"
                value={formData.age}
                onChange={e => setFormData({ ...formData, age: e.target.value })}
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
              <select
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value })}
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
              <select
                value={formData.department_id}
                onChange={e => setFormData({ ...formData, department_id: e.target.value })}
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Triage Priority</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, priority: 'normal' })}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                  formData.priority === 'normal' 
                    ? 'bg-sky-50 text-sky-700 border-sky-400 ring-1 ring-sky-300' 
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                Normal Routine
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, priority: 'emergency' })}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                  formData.priority === 'emergency' 
                    ? 'bg-rose-50 text-rose-700 border-rose-400 ring-1 ring-rose-300' 
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                <HeartPulse className="w-3.5 h-3.5 text-rose-600" />
                Emergency Priority
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Reason / Symptoms (Optional)</label>
            <input 
              type="text"
              value={formData.reason}
              onChange={e => setFormData({ ...formData, reason: e.target.value })}
              placeholder="e.g. Chest discomfort, routine cardiology follow-up"
              className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              <Clock className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? "Registering & Assigning..." : "Generate Token"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
