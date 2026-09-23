import React, { useState } from 'react';
import { 
  Activity, Clock, Bell, User, ChevronDown, 
  ShieldAlert, RefreshCw, LogOut, CheckCircle2,
  Stethoscope, UserCheck, Sparkles
} from 'lucide-react';

export default function Navbar({ 
  currentUser, 
  currentRole, 
  onRoleChange, 
  notifications = [], 
  onOpenNotifications,
  onRecalculate,
  onNewRegistration
}) {
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const roleLabels = {
    patient: { label: "Patient Portal", badge: "bg-sky-100 text-sky-800 border-sky-200", icon: User },
    staff: { label: "Reception / Staff", badge: "bg-amber-100 text-amber-800 border-amber-200", icon: UserCheck },
    doctor: { label: "Doctor Console", badge: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Stethoscope },
    admin: { label: "Hospital Admin", badge: "bg-teal-100 text-teal-800 border-teal-200", icon: Sparkles }
  };

  const demoRoles = [
    { id: 1, role: 'admin', name: 'Dr. Alok Sharma', roleTitle: 'Chief Medical Admin' },
    { id: 3, role: 'doctor', name: 'Dr. Kumar', roleTitle: 'Cardiology Specialist' },
    { id: 2, role: 'staff', name: 'Sarah Jenkins, RN', roleTitle: 'Triage / Receptionist' },
    { id: 10, role: 'patient', name: 'John Doe', roleTitle: 'Active Patient (A-127)' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Tagline */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-700 flex items-center justify-center text-white shadow-sm shadow-sky-500/20">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold tracking-tight text-slate-900">
                  MediWait<span className="text-sky-600">.AI</span>
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                  v2.0 ML-Live
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden md:block">
                Your Time, Our Care • Intelligent Hospital Waiting Time Prediction
              </p>
            </div>
          </div>

          {/* Center: Live Sync & Quick Actions */}
          <div className="hidden lg:flex items-center space-x-2 text-xs text-slate-500">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-medium text-slate-700">Predictive Queue Engine Active</span>
            <button 
              onClick={onRecalculate}
              title="Recalculate wait times using real-time ML inference"
              className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-sky-600 hover:bg-slate-100 transition-colors border border-slate-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sync Model
            </button>
          </div>

          {/* Right Actions: Role Switcher & User */}
          <div className="flex items-center space-x-3">
            
            {/* Quick Walk-in Button */}
            <button
              onClick={onNewRegistration}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all"
            >
              <Clock className="w-3.5 h-3.5" />
              New Token
            </button>

            {/* Notifications Button */}
            <button
              onClick={onOpenNotifications}
              className="relative p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Hospital & Queue Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Role Switcher Pill */}
            <div className="relative">
              <button
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  roleLabels[currentRole]?.badge || 'bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>{roleLabels[currentRole]?.label}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </button>

              {/* Role Dropdown */}
              {showRoleMenu && (
                <div 
                  className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  onMouseLeave={() => setShowRoleMenu(false)}
                >
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Switch Active Persona
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Instantly test how MediWait operates across all roles:
                    </p>
                  </div>
                  <div className="py-1">
                    {demoRoles.map(dr => (
                      <button
                        key={dr.id}
                        onClick={() => {
                          onRoleChange(dr.role, dr.id);
                          setShowRoleMenu(false);
                        }}
                        className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                          currentRole === dr.role ? 'bg-sky-50 text-sky-900 font-semibold' : 'text-slate-700'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{dr.name}</p>
                          <p className="text-[11px] text-slate-500">{dr.roleTitle}</p>
                        </div>
                        {currentRole === dr.role && (
                          <CheckCircle2 className="w-4 h-4 text-sky-600" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </header>
  );
}
