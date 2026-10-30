import React from 'react';
import { Stethoscope, CheckCircle2, Clock, AlertCircle, Play, Check, Users, Sparkles } from 'lucide-react';

export default function DoctorView({ 
  doctorName = "Dr. Kumar", 
  department = "Cardiology",
  queue = [],
  onCallNext,
  onComplete,
  onEmergency
}) {
  // Filter queue assigned to this doctor or department
  const isWaiting = (status) => status === 'waiting' || status === 'registered';
  const isConsulting = (status) => status === 'consulting' || status === 'in_consultation';
  const doctorQueue = queue.filter(q => q.department_name === department);
  const currentlyConsulting = doctorQueue.find(q => isConsulting(q.status));
  const waitingPatients = doctorQueue.filter(q => isWaiting(q.status));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Doctor Header */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-emerald-300">
              <Stethoscope className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black">{doctorName}</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  Available • Room 101
                </span>
              </div>
              <p className="text-xs text-emerald-100 mt-0.5">
                {department} Specialist • OPD Consultation Console
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-emerald-950/60 px-5 py-3 rounded-2xl border border-emerald-700/50 text-xs">
            <div className="text-center">
              <p className="text-[10px] uppercase text-emerald-300 font-bold">Consulted Today</p>
              <p className="text-xl font-extrabold text-white">38</p>
            </div>
            <div className="w-px h-8 bg-emerald-800" />
            <div className="text-center">
              <p className="text-[10px] uppercase text-emerald-300 font-bold">In Queue</p>
              <p className="text-xl font-extrabold text-white">{waitingPatients.length}</p>
            </div>
            <div className="w-px h-8 bg-emerald-800" />
            <div className="text-center">
              <p className="text-[10px] uppercase text-emerald-300 font-bold">Avg Consult</p>
              <p className="text-xl font-extrabold text-emerald-300">11 min</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Consultation Spotlight */}
      {currentlyConsulting ? (
        <div className="medical-card p-6 border-2 border-emerald-500 bg-emerald-50/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-md shrink-0">
                {currentlyConsulting.token_number}
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 animate-pulse">
                  Consultation in Progress
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  {currentlyConsulting.patient_name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  MRN: {currentlyConsulting.patient_mrn || "MRN-1049"} • Started at {new Date(currentlyConsulting.consultation_started_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => onComplete(currentlyConsulting.id)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Finish Consultation
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="medical-card p-6 text-center border-dashed border-2 border-slate-300">
          <p className="text-sm font-bold text-slate-700">No Patient Currently in Consultation Room</p>
          <p className="text-xs text-slate-400 mt-1">Ready to invite the next waiting patient.</p>
        </div>
      )}

      {/* Doctor Waiting Queue */}
      <div className="medical-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Your Waiting Patients ({waitingPatients.length})</h3>
            <p className="text-xs text-slate-500">Ordered by arrival time & emergency triage priority</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-y border-slate-200">
              <tr>
                <th className="py-3 px-4">Token</th>
                <th className="py-3 px-4">Patient Name</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Wait Duration</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {waitingPatients.map(q => (
                <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{q.token_number}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">{q.patient_name}</td>
                  <td className="py-3.5 px-4">
                    {q.priority === 'emergency' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                        Emergency
                      </span>
                    ) : (
                      <span className="text-slate-400">Normal</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-700">{q.estimated_wait_minutes} min</td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => onCallNext(q.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 ml-auto"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start Consult
                    </button>
                  </td>
                </tr>
              ))}
              {waitingPatients.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-400 text-xs">
                    Queue is clear. No waiting patients in {department}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
