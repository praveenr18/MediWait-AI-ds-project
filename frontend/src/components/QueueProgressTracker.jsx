import React from 'react';
import { CheckCircle2, Clock, Stethoscope, Award, ArrowRight } from 'lucide-react';

export default function QueueProgressTracker({ status = "waiting" }) {
  const steps = [
    { id: 'registered', label: 'Registered', icon: CheckCircle2, desc: 'Triage & Token' },
    { id: 'waiting', label: 'Waiting', icon: Clock, desc: 'Queue Line' },
    { id: 'consulting', label: 'Consultation', icon: Stethoscope, desc: 'Doctor Assessment' },
    { id: 'completed', label: 'Completed', icon: Award, desc: 'Visit Concluded' }
  ];

  const statusOrder = {
    'registered': 0,
    'waiting': 1,
    'consulting': 2,
    'in_consultation': 2,
    'completed': 3
  };

  const normStatus = status?.toLowerCase() || 'waiting';
  const currentIdx = statusOrder[normStatus] ?? 1;
  const isFinished = normStatus === 'completed';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Visit Progress Tracker
        </h4>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
          isFinished
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
            : (normStatus === 'consulting' || normStatus === 'in_consultation')
              ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold'
              : 'bg-sky-50 text-sky-700 border-sky-200 font-bold'
        }`}>
          Status: <span className="capitalize">{normStatus === 'in_consultation' ? 'Consulting' : normStatus}</span>
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 relative">
        {steps.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex flex-col items-center text-center relative group">
              {/* Connector line */}
              {idx < steps.length - 1 && (
                <div 
                  className={`hidden sm:block absolute top-5 left-1/2 w-full h-1 -z-0 transition-colors ${
                    idx < currentIdx ? (isFinished ? 'bg-emerald-500' : 'bg-sky-500') : 'bg-slate-200'
                  }`} 
                />
              )}

              {/* Step Circle */}
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all ${
                  isDone 
                    ? 'bg-sky-600 text-white shadow-xs' 
                    : isCurrent 
                      ? (isFinished 
                          ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 shadow-md' 
                          : 'bg-sky-500 text-white ring-4 ring-sky-100 shadow-md animate-pulse')
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>

              {/* Label & Description */}
              <p className={`text-xs mt-2 font-bold transition-colors ${
                isCurrent 
                  ? (isFinished ? 'text-emerald-700' : 'text-sky-600') 
                  : isDone 
                    ? 'text-slate-900' 
                    : 'text-slate-400'
              }`}>
                {step.label}
              </p>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                {step.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
