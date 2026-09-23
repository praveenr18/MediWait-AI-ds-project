import React from 'react';
import { UserCheck, UserPlus, Clock, HeartPulse, Search, Play, AlertCircle } from 'lucide-react';

export default function StaffView({ 
  staffName = "Sarah Jenkins, RN",
  departments = [],
  queue = [],
  onOpenNewToken,
  onCallNext,
  onEmergency,
  onRecalculate
}) {
  const waitingPatients = queue.filter(q => q.status === "waiting");
  const emergencyCount = queue.filter(q => q.priority === "emergency" && q.status === "waiting").length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Staff Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-700 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-200">
              <UserCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black">{staffName}</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                  Chief Triage Desk
                </span>
              </div>
              <p className="text-xs text-amber-100 mt-0.5">
                Front Desk Intake, Token Generation & Emergency Patient Triage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenNewToken}
              className="px-5 py-2.5 bg-white hover:bg-amber-50 text-amber-800 text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Register New Patient
            </button>
          </div>
        </div>
      </div>

      {/* Triage Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="medical-card p-5 border-l-4 border-l-amber-500">
          <span className="text-xs font-bold uppercase text-slate-400">Total In Waiting Line</span>
          <p className="text-3xl font-black text-slate-900 mt-1">{waitingPatients.length}</p>
          <p className="text-xs text-slate-500 mt-1">Across all 5 OPD departments</p>
        </div>

        <div className="medical-card p-5 border-l-4 border-l-rose-500">
          <span className="text-xs font-bold uppercase text-slate-400">Active Emergency Triages</span>
          <p className="text-3xl font-black text-rose-600 mt-1">{emergencyCount}</p>
          <p className="text-xs text-rose-700 font-semibold mt-1">Fast-Track priority enabled</p>
        </div>

        <div className="medical-card p-5 border-l-4 border-l-emerald-500">
          <span className="text-xs font-bold uppercase text-slate-400">Active Physicians</span>
          <p className="text-3xl font-black text-emerald-600 mt-1">12</p>
          <p className="text-xs text-slate-500 mt-1">Accepting consultations</p>
        </div>
      </div>

      {/* Front Desk Queue Management */}
      <div className="medical-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Hospital Intake & Queue Desk</h3>
            <p className="text-xs text-slate-500">Process walk-in arrivals, issue tokens, or escalate priority</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-y border-slate-200">
              <tr>
                <th className="py-3 px-4">Token</th>
                <th className="py-3 px-4">Patient Name</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Est. Wait</th>
                <th className="py-3 px-4 text-right">Triage Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queue.map(q => (
                <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{q.token_number}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">{q.patient_name}</td>
                  <td className="py-3.5 px-4 text-slate-600">{q.department_name}</td>
                  <td className="py-3.5 px-4">
                    {q.priority === 'emergency' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                        Emergency
                      </span>
                    ) : (
                      <span className="text-slate-400">Normal</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      q.status === 'consulting' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-800">{q.estimated_wait_minutes} min</td>
                  <td className="py-3.5 px-4 text-right space-x-1.5">
                    {q.status === 'waiting' && (
                      <>
                        <button
                          onClick={() => onCallNext(q.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors"
                        >
                          Call
                        </button>
                        <button
                          onClick={() => onEmergency(q.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                        >
                          Emergency
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
