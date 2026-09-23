import React from 'react';
import { X, Brain, CheckCircle2, AlertTriangle, Clock, Users, Stethoscope, Flame } from 'lucide-react';

export default function WhyThisWaitModal({ isOpen, onClose, explanationData }) {
  if (!isOpen || !explanationData) return null;

  const {
    token_number = "A-127",
    department = "Cardiology",
    predicted_wait_minutes = 34,
    confidence_pct = 94,
    summary = "",
    factors = [],
    model_used = "Gradient Boosting Regressor"
  } = explanationData;

  const getLevelBadge = (level) => {
    switch (level?.toLowerCase()) {
      case 'high':
      case 'peak':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'optimal':
      case 'low':
      case 'normal':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-sky-600 to-blue-700 px-6 py-5 text-white flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Brain className="w-5 h-5 text-sky-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold">Why is my waiting time {predicted_wait_minutes} minutes?</h3>
              </div>
              <p className="text-xs text-sky-100 mt-0.5">
                Explainable AI (XAI) Attribution for Token <span className="font-semibold text-white">{token_number}</span> • {department}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">
          
          {/* Summary Box */}
          <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700 leading-relaxed">
              {summary || `Your predicted waiting time of ${predicted_wait_minutes} minutes is calculated dynamically from current queue volume, doctor capacity, and incoming emergency triage priorities.`}
            </p>
          </div>

          {/* Model & Confidence Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-500">Inference Engine:</span>
              <span className="font-semibold text-slate-800">{model_used}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-slate-500">Confidence:</span>
              <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {confidence_pct}%
              </span>
            </div>
          </div>

          {/* Key Drivers Table / List */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Operational Contribution Drivers
            </h4>
            
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50">
              {factors.map((item, idx) => (
                <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-white transition-colors">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-900">{item.factor}</p>
                    <p className="text-[11px] text-slate-500">{item.impact}</p>
                  </div>
                  
                  <div className="flex items-center space-x-3 text-right">
                    <span className="text-xs font-medium text-slate-700">{item.value}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getLevelBadge(item.level)}`}>
                      {item.level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Transparency Disclaimer */}
          <p className="text-[11px] text-slate-400 text-center italic">
            MediWait AI predicts operational delays only. Predictions automatically update if emergency triages or doctor shifts change.
          </p>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            Got it, thanks
          </button>
        </div>

      </div>
    </div>
  );
}
