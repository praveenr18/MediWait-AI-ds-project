import React, { useState } from 'react';
import { 
  Clock, ShieldCheck, Users, AlertCircle, 
  Stethoscope, Sparkles, ChevronRight, Bell,
  Calendar, Award, HeartHandshake, HelpCircle, 
  ExternalLink, CheckCircle2, User, RefreshCw
} from 'lucide-react';
import QueueProgressTracker from './QueueProgressTracker';

export default function PatientView({ 
  tokenData, 
  departments = [], 
  queueList = [], 
  notifications = [],
  onOpenWhyThisWait, 
  onOpenFeedback,
  onOpenNewToken,
  onRefresh
}) {
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, liveQueue, notifications, profile

  // Format expected consultation time e.g. "11:48 AM"
  const getExpectedTime = (mins) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + (mins || 34));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const currentToken = tokenData?.token_number || "A-127";
  const departmentName = tokenData?.department_name || "Cardiology Department";
  const waitMinutes = tokenData?.estimated_wait_minutes ?? 34;
  const confidence = tokenData?.prediction_confidence ?? 94;
  const queuePos = tokenData?.queue_position ?? 8;
  const aheadCount = tokenData?.patients_ahead ?? 7;
  const doctorName = tokenData?.doctor_name || "Dr. Kumar";
  const status = tokenData?.status || "waiting";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Patient Header (Section 6) */}
      <div className="mb-6 bg-gradient-to-r from-sky-600 via-sky-700 to-blue-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg shadow-sky-600/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-sky-200 text-xs font-semibold uppercase tracking-wider mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>MediWait AI • Live Patient Queue Tracking</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Hello, John Doe 👋
            </h1>
            <p className="text-sm text-sky-100 mt-1 max-w-xl">
              We're here to help you manage your waiting time with real-time AI operational predictions.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sync Queue
            </button>
            <button
              onClick={onOpenNewToken}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white text-sky-700 hover:bg-sky-50 shadow-sm transition-colors"
            >
              Register Visit
            </button>
          </div>
        </div>

        {/* Patient Sub-navigation (Section 47) */}
        <div className="flex items-center space-x-1 sm:space-x-2 mt-6 pt-4 border-t border-white/15 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all shrink-0 ${
              activeTab === 'dashboard' ? 'bg-white text-sky-800 shadow-xs' : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            🏠 My Dashboard
          </button>
          <button
            onClick={() => setActiveTab('liveQueue')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all shrink-0 ${
              activeTab === 'liveQueue' ? 'bg-white text-sky-800 shadow-xs' : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            👥 Live Hospital Queue
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all shrink-0 ${
              activeTab === 'notifications' ? 'bg-white text-sky-800 shadow-xs' : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            🔔 Notifications ({notifications.length})
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all shrink-0 ${
              activeTab === 'profile' ? 'bg-white text-sky-800 shadow-xs' : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            👤 My Visits & Profile
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          
          {/* Progress Tracker (Section 7) */}
          <QueueProgressTracker status={status} />

          {/* Primary Cards Grid (Section 6 & 8) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Token Card */}
            <div className="medical-card p-5 border-l-4 border-l-sky-500 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Your Token
                </span>
                <h3 className="text-3xl font-extrabold text-slate-900 mt-1">
                  {currentToken}
                </h3>
              </div>
              <p className="text-xs font-semibold text-sky-700 mt-3 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                {departmentName}
              </p>
            </div>

            {/* Estimated Waiting Time Card */}
            <div className="medical-card p-5 border-l-4 border-l-blue-600 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Estimated Waiting Time
                </span>
                <div className="flex items-baseline space-x-1.5 mt-1">
                  <h3 className="text-3xl font-extrabold text-slate-900">{waitMinutes}</h3>
                  <span className="text-sm font-bold text-slate-500">Minutes</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Expected: <span className="font-bold text-slate-800">{getExpectedTime(waitMinutes)}</span>
              </p>
            </div>

            {/* Prediction Confidence Card */}
            <div className="medical-card p-5 border-l-4 border-l-emerald-500 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Prediction Confidence
                </span>
                <div className="flex items-baseline space-x-1 mt-1">
                  <h3 className="text-3xl font-extrabold text-emerald-600">{confidence}%</h3>
                </div>
              </div>
              <p className="text-xs text-emerald-700 mt-3 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Trained Gradient Boosting ML Model
              </p>
            </div>

            {/* Assigned Doctor Card */}
            <div className="medical-card p-5 border-l-4 border-l-indigo-500 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Assigned Doctor
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  {doctorName}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-3 flex items-center gap-1">
                <Stethoscope className="w-3.5 h-3.5 text-indigo-500" />
                Room 101 • Consulting
              </p>
            </div>

          </div>

          {/* Secondary Queue Position Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Queue Position</p>
                <p className="text-2xl font-bold text-slate-800 mt-0.5">{queuePos}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-600 shadow-xs">
                <Users className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Patients Ahead</p>
                <p className="text-2xl font-bold text-slate-800 mt-0.5">{aheadCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-600 shadow-xs">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Emergency Cases Ahead</p>
                <p className="text-2xl font-bold text-rose-600 mt-0.5">2</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-rose-600 shadow-xs">
                <AlertCircle className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* AI PREDICTION CARD (Section 8) */}
          <div className="medical-card p-6 border-2 border-sky-100 bg-gradient-to-br from-white to-sky-50/40">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-700 bg-sky-100/80 px-2 py-0.5 rounded">
                      AI Estimated Waiting Time
                    </span>
                    <span className="text-xs text-slate-400">• Real-Time Inferred</span>
                  </div>
                  <div className="flex items-baseline space-x-3 mt-1.5">
                    <span className="text-4xl font-extrabold text-slate-900">{waitMinutes} Minutes</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {confidence}% Confidence
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Expected Consultation Window: <span className="font-bold text-slate-800">{getExpectedTime(waitMinutes)}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onOpenWhyThisWait}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2"
                >
                  <HelpCircle className="w-4 h-4" />
                  Why this wait?
                </button>
                <button
                  onClick={onOpenFeedback}
                  className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
                >
                  <HeartHandshake className="w-4 h-4 text-slate-500" />
                  Rate Experience
                </button>
              </div>
            </div>
          </div>

          {/* Department Live Waiting Times (Section 10) */}
          <div className="medical-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Hospital Department Waiting Times</h3>
                <p className="text-xs text-slate-500">Live operational status across outpatient clinics</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">Updated 1 min ago</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {departments.map((dept) => {
                const isHigh = dept.status_badge === "High";
                const isMod = dept.status_badge === "Moderate";
                return (
                  <div 
                    key={dept.id}
                    className={`p-4 rounded-xl border transition-all ${
                      dept.name === 'Cardiology' 
                        ? 'bg-sky-50/70 border-sky-300 ring-1 ring-sky-200' 
                        : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-800 truncate">{dept.name}</p>
                    <p className="text-2xl font-extrabold text-slate-900 mt-1">
                      {dept.avg_wait_minutes} <span className="text-xs font-normal text-slate-500">min</span>
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60 text-[10px]">
                      <span className="text-slate-500">{dept.doctors_on_duty} Doctors</span>
                      <span className={`px-2 py-0.5 rounded-full font-bold ${
                        isHigh ? 'bg-amber-100 text-amber-800' : isMod ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {dept.status_badge}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* LIVE QUEUE VIEW (Section 9) */}
      {activeTab === 'liveQueue' && (
        <div className="medical-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Live Department Queue</h3>
              <p className="text-xs text-slate-500">Cardiology Outpatient Clinic • Real-time status update</p>
            </div>
            <button
              onClick={onRefresh}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Token</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4">Doctor</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Est. Wait</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queueList.filter(q => q.department_name === "Cardiology").map((q) => {
                  const isYou = q.token_number === currentToken;
                  return (
                    <tr 
                      key={q.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isYou ? 'bg-sky-50/70 font-semibold' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-900">{q.token_number}</span>
                          {isYou && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-600 text-white">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-800">
                        {isYou ? "John Doe" : `Patient ${q.id}`}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{q.doctor_name || "Dr. Kumar"}</td>
                      <td className="py-3.5 px-4">
                        {q.priority === 'emergency' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            Emergency
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">Normal</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          q.status === 'consulting' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {q.status === 'consulting' ? 'Consulting' : 'Waiting'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {q.status === 'consulting' ? '—' : `${q.estimated_wait_minutes} min`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS VIEW (Section 11) */}
      {activeTab === 'notifications' && (
        <div className="medical-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Queue Alerts & Notifications</h3>
              <p className="text-xs text-slate-500">Live timeline of your visit milestones and triage updates</p>
            </div>
            <Bell className="w-5 h-5 text-sky-600" />
          </div>

          <div className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <div key={n.id} className="py-3.5 flex items-start space-x-3">
                <div className="w-8 h-8 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0 mt-0.5">
                  <Bell className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-900">{n.title}</p>
                    <span className="text-[10px] text-slate-400">
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PROFILE & VISITS VIEW (Section 12) */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="medical-card p-6 text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-sky-100 border-2 border-sky-300 text-sky-700 flex items-center justify-center mx-auto text-2xl font-bold">
              JD
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">John Doe</h4>
              <p className="text-xs text-slate-500">MRN: MRN-1049 • Male, 42 yrs</p>
              <p className="text-xs text-slate-500">+1 (555) 987-6543 • Blood: O+</p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Verified Patient
              </span>
            </div>
          </div>

          <div className="medical-card p-6 md:col-span-2 space-y-4">
            <h4 className="text-sm font-bold text-slate-900">Recent Visit History</h4>
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">Cardiology Outpatient Follow-up</p>
                  <p className="text-[11px] text-slate-500">Today • Dr. Kumar • Token A-127</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                  In Progress
                </span>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">General Medicine Annual Wellness</p>
                  <p className="text-[11px] text-slate-500">Aug 14, 2026 • Dr. Anita Roy • Actual wait: 14 min</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                  Completed
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
