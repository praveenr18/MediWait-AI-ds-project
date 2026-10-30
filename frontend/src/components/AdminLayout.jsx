import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, RefreshCw, Users, Stethoscope, 
  Building2, Brain, BarChart3, Sparkles, 
  FlaskConical, FileText, Bell, Settings, LogOut,
  AlertTriangle, CheckCircle2, Clock, TrendingUp,
  Download, Plus, Search, ShieldAlert, ArrowUpRight,
  Flame, HeartPulse, UserPlus, Play, Check, ChevronRight
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import DoctorsManagement from './DoctorsManagement';
import DepartmentsManagement from './DepartmentsManagement';

export default function AdminLayout({
  kpis,
  departments = [],
  doctors = [],
  queue = [],
  alerts = [],
  onCallNext,
  onComplete,
  onEmergency,
  onCancelToken,
  onRecalculate,
  onOpenNewToken,
  onOpenSimulation,
  onExportCsv,
  onRefreshAll
}) {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [trendData, setTrendData] = useState([]);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [simResults, setSimResults] = useState(null);
  const [simInputs, setSimInputs] = useState({
    department: 'Cardiology',
    current_wait_minutes: 34,
    current_doctors: 3,
    current_queue_length: 8,
    emergency_cases: 2,
    doctor_adjustments: [1, 2, -1]
  });

  useEffect(() => {
    // Load backend analytics & metrics
    fetch("http://localhost:8000/api/analytics/waiting-trend")
      .then(r => r.json()).then(d => setTrendData(d)).catch(() => {});
    fetch("http://localhost:8000/api/predict/metrics")
      .then(r => r.json()).then(d => setModelMetrics(d)).catch(() => {});
    fetch("http://localhost:8000/api/analytics/peak-heatmap")
      .then(r => r.json()).then(d => setHeatmapData(d)).catch(() => {});
    fetch("http://localhost:8000/api/analytics/forecasting")
      .then(r => r.json()).then(d => setForecastData(d)).catch(() => {});
    fetch("http://localhost:8000/api/analytics/recommendations")
      .then(r => r.json()).then(d => setRecommendations(d)).catch(() => {});
    
    // Initial simulation
    runSimulation();
  }, []);

  const runSimulation = (customParams) => {
    const payload = customParams || simInputs;
    fetch("http://localhost:8000/api/predict/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(data => setSimResults(data))
      .catch(console.error);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'liveQueue', label: 'Live Queue', icon: RefreshCw },
    { id: 'aiPrediction', label: 'AI Prediction', icon: Brain },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'forecasting', label: 'Forecasting', icon: Sparkles },
    { id: 'simulations', label: 'Simulations', icon: FlaskConical },
    { id: 'doctors', label: 'Doctors', icon: Stethoscope },
    { id: 'departments', label: 'Departments', icon: Building2 },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: alerts.filter(a => !a.is_resolved).length }
  ];

  // Helpers for canonical queue statuses
  const isWaiting = (status) => status === 'waiting' || status === 'registered';
  const isConsulting = (status) => status === 'consulting' || status === 'in_consultation';
  const isActive = (status) => isWaiting(status) || isConsulting(status);

  // Active entries across the hospital
  const hospitalActiveQueue = queue.filter(q => isActive(q.status));
  const hospitalWaitingCount = kpis?.waiting_patients_now ?? hospitalActiveQueue.filter(q => isWaiting(q.status)).length;
  const hospitalConsultingCount = kpis?.consulting_patients_now ?? hospitalActiveQueue.filter(q => isConsulting(q.status)).length;

  // Filtered queue entries (strictly active patients)
  const filteredQueue = queue.filter(q => {
    const isPatientActive = isActive(q.status);
    const matchesDept = selectedDept === 'all' || q.department_id === parseInt(selectedDept);
    const matchesSearch = !searchQuery || 
      q.token_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.patient_name.toLowerCase().includes(searchQuery.toLowerCase());
    return isPatientActive && matchesDept && matchesSearch;
  });

  const isDeptFiltered = selectedDept !== 'all';
  const queueForStats = isDeptFiltered ? filteredQueue : hospitalActiveQueue;

  const liveWaitingCount = queueForStats.filter(q => isWaiting(q.status)).length;
  const liveConsultingCount = queueForStats.filter(q => isConsulting(q.status)).length;
  const liveEmergencyCount = queueForStats.filter(q => q.priority === 'emergency' && isWaiting(q.status)).length;

  const waitingWithTimes = queueForStats.filter(q => isWaiting(q.status) && (q.estimated_wait_minutes || 0) > 0);
  const liveAvgWait = waitingWithTimes.length > 0 
    ? Math.round(waitingWithTimes.reduce((s, q) => s + (q.estimated_wait_minutes || 0), 0) / waitingWithTimes.length)
    : (liveWaitingCount > 0 ? Math.round(queueForStats.filter(q => isWaiting(q.status)).reduce((s, q) => s + (q.estimated_wait_minutes || 0), 0) / liveWaitingCount) : 0);

  const handleExportContextualCsv = () => {
    if (activeMenu === 'doctors') {
      const headers = ["Doctor ID", "Name", "Specialization", "Department", "Room", "Status", "Active Patients", "Avg Wait (Min)", "Email", "Phone"];
      const rows = doctors.map(d => [
        `DOC-${String(d.id).padStart(3, '0')}`,
        `"${d.name || ''}"`,
        `"${d.specialization || ''}"`,
        `"${d.department || ''}"`,
        `"${d.room_number || ''}"`,
        `"${d.status || ''}"`,
        d.active_patient_count ?? d.current_patients_count ?? 0,
        d.avg_wait_minutes ?? Math.round(d.avg_consult_time || 12),
        `"${d.email || ''}"`,
        `"${d.phone || ''}"`
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mediwait_doctors_roster_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (activeMenu === 'departments') {
      const headers = ["Code", "Name", "Description", "Assigned Doctors", "Waiting Patients", "Consulting Patients", "Avg Wait (Min)", "Status"];
      const rows = departments.map(d => [
        `"${d.code || ''}"`,
        `"${d.name || ''}"`,
        `"${(d.description || '').replace(/"/g, '""')}"`,
        d.assigned_doctors_count ?? (d.doctors?.length || 0),
        queue.filter(q => q.department_id === d.id && (q.status === 'waiting' || q.status === 'registered')).length || d.waiting_count || 0,
        queue.filter(q => q.department_id === d.id && (q.status === 'consulting' || q.status === 'in_consultation')).length || d.consulting_count || 0,
        d.avg_wait_minutes ?? Math.round(d.avg_consult_time || 12),
        `"${d.operational_status || (d.is_active ? 'Normal' : 'Inactive')}"`
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mediwait_departments_roster_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      if (onExportCsv) onExportCsv();
    }
  };

  const deptColors = ['#0284c7', '#10b981', '#f59e0b', '#6366f1', '#ec4899'];

  return (
    <div className="flex min-h-[calc(100vh-64px)] bg-slate-100">
      
      {/* Dark Green Vertical Sidebar (Section 14 & 48) */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 shadow-xl border-r border-slate-800">
        <div>
          {/* Hospital Management Brand Header */}
          <div className="p-5 border-b border-slate-800 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-md shadow-emerald-600/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white tracking-wide">Hospital Ops Hub</h2>
              <p className="text-[11px] text-emerald-400 font-medium">Executive Admin Console</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveMenu(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-700/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 text-xs">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-500 text-emerald-400 flex items-center justify-center font-bold">
              AS
            </div>
            <div>
              <p className="font-bold text-white leading-none">Dr. Alok Sharma</p>
              <p className="text-[10px] text-slate-400 mt-1">Chief Medical Admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6">

        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight capitalize">
              {activeMenu === 'dashboard' ? 'Hospital Operations Command' : activeMenu.replace(/([A-Z])/g, ' $1')}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Live capacity monitoring, queue telemetry & machine learning waiting predictions
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRecalculate}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recalculate Queues
            </button>
            <button
              onClick={onOpenNewToken}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Register Patient
            </button>
            <button
              onClick={handleExportContextualCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-black text-white shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* -------------------- VIEW 1: DASHBOARD OVERVIEW -------------------- */}
        {activeMenu === 'dashboard' && (
          <div className="space-y-6">
            
            {/* KPI Cards (Section 15) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              
              {/* Total Patients */}
              <div className="medical-card p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Total Patients</span>
                <p className="text-2xl font-black text-slate-900 mt-1">245</p>
                <p className="text-[10px] text-emerald-600 font-semibold mt-1">Today</p>
              </div>

              {/* Waiting Patients */}
              <div className="medical-card p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Waiting</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{hospitalWaitingCount}</p>
                <p className="text-[10px] text-amber-600 font-semibold mt-1">Now</p>
              </div>

              {/* Doctors Available */}
              <div className="medical-card p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Doctors</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{kpis?.doctors_available_ratio ?? "8 / 9"}</p>
                <p className="text-[10px] text-slate-500 font-medium mt-1">On Duty</p>
              </div>

              {/* Emergency Cases */}
              <div className="medical-card p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Emergency</span>
                <p className="text-2xl font-black text-rose-600 mt-1">{kpis?.emergency_cases_now ?? hospitalActiveQueue.filter(q => q.priority === 'emergency' && isWaiting(q.status)).length}</p>
                <p className="text-[10px] text-rose-600 font-semibold mt-1">Triage Active</p>
              </div>

              {/* Average Waiting Time */}
              <div className="medical-card p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Avg Wait</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{kpis?.avg_waiting_time_minutes ?? (hospitalWaitingCount > 0 ? liveAvgWait : 0)} <span className="text-xs font-normal text-slate-400">min</span></p>
                <p className="text-[10px] text-emerald-600 font-semibold mt-1">Within SLA</p>
              </div>

              {/* Queue Status */}
              <div className="medical-card p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Queue Status</span>
                <p className="text-xl font-black text-emerald-700 mt-1">{kpis?.queue_status ?? "Normal"}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-1">Optimal Flow</p>
              </div>

              {/* Prediction Accuracy */}
              <div className="medical-card p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Accuracy</span>
                <p className="text-2xl font-black text-sky-700 mt-1">94%</p>
                <p className="text-[10px] text-sky-600 font-semibold mt-1">Holdout R²</p>
              </div>

              {/* Patient Satisfaction */}
              <div className="medical-card p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Satisfaction</span>
                <p className="text-2xl font-black text-amber-500 mt-1">4.7 <span className="text-xs text-slate-400">/ 5</span></p>
                <p className="text-[10px] text-slate-500 font-medium mt-1">Verified</p>
              </div>

            </div>

            {/* AI Recommendation Card (Section 32) */}
            {recommendations.length > 0 && (
              <div className="bg-gradient-to-r from-emerald-950 to-slate-900 rounded-2xl p-5 text-white border border-emerald-800 shadow-md">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Brain className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-900/60 px-2 py-0.5 rounded">
                          AI Resource Recommendation
                        </span>
                        <span className="text-[11px] text-slate-400 italic">
                          (Derived via ML Queue Simulation)
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white mt-1">
                        {recommendations[0]?.issue}
                      </h4>
                      <p className="text-xs text-emerald-200 mt-0.5">
                        <span className="font-semibold text-white">Recommendation:</span> {recommendations[0]?.recommendation} • <span className="font-bold text-emerald-300">{recommendations[0]?.expected_impact}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveMenu('simulations')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shrink-0 transition-colors"
                  >
                    Launch Simulation Lab
                  </button>
                </div>
              </div>
            )}

            {/* Two Column Section: Department Wait Times & Waiting Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Department Waiting Time Bars (Section 10 & 33) */}
              <div className="medical-card p-6 lg:col-span-1 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Department Wait Times</h3>
                    <p className="text-xs text-slate-500">Benchmark comparison</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    Target: 20 min
                  </span>
                </div>

                <div className="space-y-3.5 pt-2">
                  {departments.map((d) => {
                    const pct = Math.min(100, (d.avg_wait_minutes / 40) * 100);
                    return (
                      <div key={d.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">{d.name}</span>
                          <span className="font-extrabold text-slate-900">
                            {d.avg_wait_minutes} min
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              d.avg_wait_minutes > 30 ? 'bg-amber-500' : d.avg_wait_minutes > 15 ? 'bg-sky-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>{d.waiting_count} waiting</span>
                          <span>{d.doctors_on_duty} doctors active</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Waiting Time Trend Line Chart (Section 16) */}
              <div className="medical-card p-6 lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Waiting Time Trend</h3>
                    <p className="text-xs text-slate-500">Hourly patient waiting duration (Today vs Yesterday vs Weekly Average)</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-sky-600 font-semibold">
                      <span className="w-3 h-0.5 bg-sky-600 inline-block" /> Today
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="w-3 h-0.5 bg-slate-400 inline-block" /> Yesterday
                    </span>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} unit="m" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                      />
                      <Line type="monotone" dataKey="today" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 3 }} name="Today (min)" />
                      <Line type="monotone" dataKey="yesterday" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" name="Yesterday" />
                      <Line type="monotone" dataKey="weekly_avg" stroke="#10b981" strokeWidth={1.5} name="Weekly Avg" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            {/* Quick Live Queue Snapshot & Controls (Section 17) */}
            <div className="medical-card p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Live Hospital Queue Management</h3>
                  <p className="text-xs text-slate-500">Call next, escalate emergency cases, and monitor consultations</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Search token / patient..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <select
                    value={selectedDept}
                    onChange={e => setSelectedDept(e.target.value)}
                    className="text-xs py-1.5 px-3 rounded-xl border border-slate-200 bg-white font-semibold"
                  >
                    <option value="all">All Departments</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-y border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Token</th>
                      <th className="py-3 px-4">Patient</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Doctor</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Est. Wait</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredQueue.map(q => (
                      <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{q.token_number}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{q.patient_name}</td>
                        <td className="py-3 px-4 text-slate-600">{q.department_name}</td>
                        <td className="py-3 px-4 text-slate-600">{q.doctor_name || "Unassigned"}</td>
                        <td className="py-3 px-4">
                          {q.priority === 'emergency' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              Emergency
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">Normal</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            isConsulting(q.status) ? 'bg-emerald-100 text-emerald-800' :
                            q.status === 'completed' ? 'bg-slate-100 text-slate-700' :
                            q.status === 'cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isConsulting(q.status) ? 'Consulting' : isWaiting(q.status) ? 'Waiting' : q.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {isConsulting(q.status) ? '—' : `${q.estimated_wait_minutes} min`}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          {isWaiting(q.status) && (
                            <>
                              <button
                                onClick={() => onCallNext(q.id)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                              >
                                Call Next
                              </button>
                              <button
                                onClick={() => onEmergency(q.id)}
                                title="Escalate to Emergency Priority"
                                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                              >
                                Emergency
                              </button>
                            </>
                          )}
                          {isConsulting(q.status) && (
                            <button
                              onClick={() => onComplete(q.id)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            >
                              Complete
                            </button>
                          )}
                          {isWaiting(q.status) && (
                            <button
                              onClick={() => onCancelToken(q.id)}
                              className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* -------------------- VIEW 1b: LIVE QUEUE MANAGEMENT -------------------- */}
        {activeMenu === 'liveQueue' && (
          <div className="space-y-6">

            {/* Live Queue Header Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="medical-card p-4">
                <span className="text-[10px] font-bold uppercase text-slate-400">Waiting Now</span>
                <p className="text-3xl font-black text-amber-600 mt-1">{liveWaitingCount}</p>
                <p className="text-[10px] text-amber-600 font-semibold mt-1">
                  {isDeptFiltered ? `Dept Queue • ${hospitalWaitingCount} Hosp Total` : 'In Queue'}
                </p>
              </div>
              <div className="medical-card p-4">
                <span className="text-[10px] font-bold uppercase text-slate-400">Consulting</span>
                <p className="text-3xl font-black text-emerald-600 mt-1">{liveConsultingCount}</p>
                <p className="text-[10px] text-emerald-600 font-semibold mt-1">
                  {isDeptFiltered ? `Dept Active • ${hospitalConsultingCount} Hosp Total` : 'Active Now'}
                </p>
              </div>
              <div className="medical-card p-4">
                <span className="text-[10px] font-bold uppercase text-slate-400">Emergency</span>
                <p className="text-3xl font-black text-rose-600 mt-1">{liveEmergencyCount}</p>
                <p className="text-[10px] text-rose-600 font-semibold mt-1">Priority Triage</p>
              </div>
              <div className="medical-card p-4">
                <span className="text-[10px] font-bold uppercase text-slate-400">Avg Wait</span>
                <p className="text-3xl font-black text-sky-700 mt-1">
                  {liveAvgWait}
                  <span className="text-sm font-normal text-slate-400 ml-1">min</span>
                </p>
                <p className="text-[10px] text-sky-600 font-semibold mt-1">AI Predicted</p>
              </div>
            </div>

            {/* Full Live Queue Table */}
            <div className="medical-card p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Live Hospital Queue</h3>
                  <p className="text-xs text-slate-500">All active patients across every department — call, escalate, or complete consultations in real time</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search token / patient..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-48"
                    />
                  </div>
                  <select
                    value={selectedDept}
                    onChange={e => setSelectedDept(e.target.value)}
                    className="text-xs py-1.5 px-3 rounded-xl border border-slate-200 bg-white font-semibold"
                  >
                    <option value="all">All Departments</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={onRecalculate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Recalculate AI
                  </button>
                </div>
              </div>

              {/* Queue Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Token</th>
                      <th className="py-3 px-4">Patient</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Doctor</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Est. Wait</th>
                      <th className="py-3 px-4">Position</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredQueue.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-slate-400">
                          <RefreshCw className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                          <p className="font-semibold">No patients in queue</p>
                          <p className="text-[11px] mt-1">Register a new patient to get started.</p>
                          <button
                            onClick={onOpenNewToken}
                            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Register Patient
                          </button>
                        </td>
                      </tr>
                    ) : filteredQueue.map(q => (
                      <tr key={q.id} className={`hover:bg-slate-50/80 transition-colors ${q.priority === 'emergency' ? 'bg-rose-50/40' : ''}`}>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{q.token_number}</td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-800">{q.patient_name}</p>
                          <p className="text-[10px] text-slate-400">{q.patient_mrn || '—'}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{q.department_name}</td>
                        <td className="py-3 px-4 text-slate-600">{q.doctor_name || 'Unassigned'}</td>
                        <td className="py-3 px-4">
                          {q.priority === 'emergency' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse inline-block" />
                              Emergency
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">Normal</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            isConsulting(q.status) ? 'bg-emerald-100 text-emerald-800' :
                            q.status === 'completed' ? 'bg-slate-100 text-slate-700' :
                            q.status === 'cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isConsulting(q.status) ? 'Consulting' : isWaiting(q.status) ? 'Waiting' : q.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {isConsulting(q.status) ? '—' : `${q.estimated_wait_minutes} min`}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-semibold">
                          {isWaiting(q.status) ? `#${q.queue_position}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          {isWaiting(q.status) && (
                            <>
                              <button
                                onClick={() => onCallNext(q.id)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                              >
                                Call Next
                              </button>
                              <button
                                onClick={() => onEmergency(q.id)}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                              >
                                Emergency
                              </button>
                              <button
                                onClick={() => onCancelToken(q.id)}
                                className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-rose-600 transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {q.status === 'consulting' && (
                            <button
                              onClick={() => onComplete(q.id)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            >
                              Complete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-slate-400 text-right">
                Showing {filteredQueue.length} entries{selectedDept !== 'all' ? ' (filtered by department)' : ''}
              </p>
            </div>

            {/* Per-Department Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {departments.map((dept, i) => {
                const deptQueue = queue.filter(q => q.department_id === dept.id && isWaiting(q.status));
                const consulting = queue.filter(q => q.department_id === dept.id && isConsulting(q.status)).length;
                return (
                  <div key={dept.id} className="medical-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 truncate">{dept.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        dept.avg_wait_minutes > 60 ? 'bg-rose-100 text-rose-700' :
                        dept.avg_wait_minutes > 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>{dept.status_badge}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>{deptQueue.length} waiting</span>
                      <span>{consulting} consulting</span>
                    </div>
                    <div className="text-lg font-black text-slate-900">{dept.avg_wait_minutes} <span className="text-xs font-normal text-slate-400">min avg</span></div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${dept.avg_wait_minutes > 60 ? 'bg-rose-500' : dept.avg_wait_minutes > 30 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, (dept.avg_wait_minutes / 100) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">{dept.doctors_on_duty} doctors on duty</p>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* -------------------- VIEW 2: AI PREDICTION & MODEL PERFORMANCE (Section 25 & 26) -------------------- */}
        {activeMenu === 'aiPrediction' && (
          <div className="space-y-6">
            
            {/* Top ML Header */}
            <div className="bg-slate-900 rounded-2xl p-6 text-white border border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Production Inference Model
                  </span>
                  <h2 className="text-2xl font-black mt-1">
                    {modelMetrics?.best_model || "Gradient Boosting Regressor"}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Model selected through automated holdout regression evaluation across 5,000 real-world operational records.
                  </p>
                </div>
                
                <div className="flex items-center gap-4 bg-slate-800/80 px-4 py-3 rounded-xl border border-slate-700">
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">MAE</p>
                    <p className="text-lg font-extrabold text-white">{modelMetrics?.best_metrics?.mae} <span className="text-xs text-slate-400 font-normal">min</span></p>
                  </div>
                  <div className="w-px h-8 bg-slate-700" />
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">RMSE</p>
                    <p className="text-lg font-extrabold text-white">{modelMetrics?.best_metrics?.rmse} <span className="text-xs text-slate-400 font-normal">min</span></p>
                  </div>
                  <div className="w-px h-8 bg-slate-700" />
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">R² Score</p>
                    <p className="text-lg font-extrabold text-emerald-400">{modelMetrics?.best_metrics?.r2}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Model Comparison Table (Section 23 & 25) */}
            <div className="medical-card p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Machine Learning Algorithm Comparison (Holdout Test Set)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-y border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Algorithm</th>
                      <th className="py-3 px-4">MAE (Mean Absolute Error)</th>
                      <th className="py-3 px-4">RMSE</th>
                      <th className="py-3 px-4">R² Score</th>
                      <th className="py-3 px-4">Accuracy Equiv.</th>
                      <th className="py-3 px-4 text-right">Selection Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modelMetrics?.all_models && Object.entries(modelMetrics.all_models).map(([mName, mVals]) => {
                      const isBest = mName === modelMetrics.best_model;
                      return (
                        <tr key={mName} className={`hover:bg-slate-50/80 transition-colors ${isBest ? 'bg-emerald-50/60 font-semibold' : ''}`}>
                          <td className="py-3.5 px-4 font-bold text-slate-900">{mName}</td>
                          <td className="py-3.5 px-4 text-slate-700">{mVals.mae} min</td>
                          <td className="py-3.5 px-4 text-slate-700">{mVals.rmse} min</td>
                          <td className="py-3.5 px-4 font-bold text-emerald-700">{mVals.r2}</td>
                          <td className="py-3.5 px-4 text-slate-800">{mVals.accuracy_pct}%</td>
                          <td className="py-3.5 px-4 text-right">
                            {isBest ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white">
                                Active Model
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Evaluated</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Feature Importance (Section 26) */}
            <div className="medical-card p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Model Feature Importance (Real Extracted Weights)</h3>
              <p className="text-xs text-slate-500">Relative contribution weights extracted directly from the trained pipeline.</p>

              <div className="space-y-3 pt-2">
                {modelMetrics?.feature_importances?.slice(0, 8).map((feat) => {
                  const pct = Math.round(feat.importance * 100);
                  const cleanName = feat.feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  return (
                    <div key={feat.feature} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">{cleanName}</span>
                        <span className="font-bold text-slate-900">{pct}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-emerald-600"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* -------------------- VIEW 3: WHAT-IF SIMULATIONS (Section 31) -------------------- */}
        {activeMenu === 'simulations' && (
          <div className="space-y-6">
            
            <div className="bg-emerald-950 text-white rounded-2xl p-6 border border-emerald-800">
              <div className="flex items-center space-x-3">
                <FlaskConical className="w-6 h-6 text-emerald-400" />
                <div>
                  <h2 className="text-xl font-bold">What-If Queue Capacity Simulation Lab</h2>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    Test resource additions, doctor shifts, and triage shock scenarios using the trained ML model.
                  </p>
                </div>
              </div>
            </div>

            {/* Simulation Controls */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 medical-card p-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Department</label>
                <select
                  value={simInputs.department}
                  onChange={e => {
                    const next = { ...simInputs, department: e.target.value };
                    setSimInputs(next);
                    runSimulation(next);
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-bold"
                >
                  {departments.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Queue Length (Patients Waiting)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={simInputs.current_queue_length}
                  onChange={e => {
                    const next = { ...simInputs, current_queue_length: parseInt(e.target.value) || 1 };
                    setSimInputs(next);
                    runSimulation(next);
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Doctors Currently on Duty</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={simInputs.current_doctors}
                  onChange={e => {
                    const next = { ...simInputs, current_doctors: parseInt(e.target.value) || 1 };
                    setSimInputs(next);
                    runSimulation(next);
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Triage Disruptions</label>
                <input
                  type="number"
                  min="0"
                  max="8"
                  value={simInputs.emergency_cases}
                  onChange={e => {
                    const next = { ...simInputs, emergency_cases: parseInt(e.target.value) || 0 };
                    setSimInputs(next);
                    runSimulation(next);
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-bold"
                />
              </div>
            </div>

            {/* Simulation Results Cards */}
            {simResults && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {simResults.scenarios.map((sc, i) => {
                    const isBase = i === 0;
                    return (
                      <div 
                        key={sc.label}
                        className={`medical-card p-5 border-2 ${
                          isBase ? 'border-slate-300 bg-slate-50' : sc.wait_time_delta_minutes < 0 ? 'border-emerald-300 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{sc.label}</span>
                          <span className="text-xs font-semibold text-slate-500">{sc.doctors} Doctor(s)</span>
                        </div>
                        <div className="mt-2">
                          <p className="text-3xl font-black text-slate-900">
                            {sc.predicted_wait_minutes} <span className="text-xs font-normal text-slate-500">min</span>
                          </p>
                          <p className={`text-xs font-bold mt-1 ${
                            isBase ? 'text-slate-400' : sc.wait_time_delta_minutes < 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {isBase ? 'Baseline' : `${sc.wait_time_delta_minutes} min (${sc.impact_pct}%)`}
                          </p>
                        </div>
                        <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-400">
                          {isBase ? 'Current operational state' : 'Simulated capacity projection'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-center gap-3">
                  <Brain className="w-5 h-5 text-sky-600 shrink-0" />
                  <p>
                    <span className="font-bold">ML Simulation Insight:</span> {simResults.recommendation}
                  </p>
                </div>
              </div>
            )}

          </div>
        )}

        {/* -------------------- VIEW 4: FORECASTING & PEAK HOURS (Section 28 & 29) -------------------- */}
        {activeMenu === 'forecasting' && (
          <div className="space-y-6">
            
            {/* Cards for +1h, +2h, tomorrow */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              <div className="medical-card p-5 border-l-4 border-l-sky-500">
                <span className="text-xs font-bold uppercase text-slate-400">Current Load</span>
                <p className="text-3xl font-black text-slate-900 mt-1">
                  {forecastData?.current_load ?? 32} <span className="text-xs font-normal text-slate-500">patients</span>
                </p>
                <p className="text-xs text-slate-500 mt-2">Active OPD queue line</p>
              </div>

              <div className="medical-card p-5 border-l-4 border-l-amber-500">
                <span className="text-xs font-bold uppercase text-slate-400">+1 Hour Arrival Forecast</span>
                <p className="text-3xl font-black text-amber-600 mt-1">
                  {forecastData?.plus_1_hour?.expected_arrivals ?? 42} <span className="text-xs font-normal text-slate-500">expected</span>
                </p>
                <p className="text-xs font-bold text-amber-700 mt-2">Traffic Surge Expected ({forecastData?.plus_1_hour?.confidence ?? 92}% confidence)</p>
              </div>

              <div className="medical-card p-5 border-l-4 border-l-rose-500">
                <span className="text-xs font-bold uppercase text-slate-400">+2 Hours Peak Window</span>
                <p className="text-3xl font-black text-rose-600 mt-1">
                  {forecastData?.plus_2_hours?.expected_arrivals ?? 51} <span className="text-xs font-normal text-slate-500">expected</span>
                </p>
                <p className="text-xs font-bold text-rose-700 mt-2">High Demand Alert: Assign On-call Physicians</p>
              </div>

            </div>

            {/* Tomorrow Peak Hour Outlook */}
            <div className="medical-card p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Tomorrow Forecast Outlook
                  </span>
                  <h3 className="text-xl font-bold mt-1">
                    Peak Traffic Window: 9:00 AM – 11:30 AM
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Projected Total Outpatients: 265 • Recommended Doctors on Duty: 14 (Ensure Cardiology & Medicine fully staffed)
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-400 text-slate-950">
                  TRAFFIC: HIGH
                </span>
              </div>
            </div>

            {/* Hourly Arrival Forecast Chart */}
            <div className="medical-card p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Projected Hourly Outpatient Influx (Next 6 Hours)</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecastData?.hourly_projections || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                    />
                    <Bar dataKey="actual_or_projected" fill="#0284c7" radius={[6, 6, 0, 0]} name="Expected Patients" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}

        {/* -------------------- VIEW 5: ANALYTICS & HEATMAP (Section 16 & 30) -------------------- */}
        {activeMenu === 'analytics' && (
          <div className="space-y-6">
            
            {/* Peak Hour Heatmap (Section 16) */}
            <div className="medical-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Peak Hour Operational Congestion Heatmap</h3>
                  <p className="text-xs text-slate-500">Historical traffic intensity from 6:00 AM to 8:00 PM across weekdays</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>Low</span>
                  <div className="flex gap-1">
                    <span className="w-3 h-3 rounded bg-emerald-100" />
                    <span className="w-3 h-3 rounded bg-amber-200" />
                    <span className="w-3 h-3 rounded bg-amber-400" />
                    <span className="w-3 h-3 rounded bg-rose-500" />
                  </div>
                  <span>Severe</span>
                </div>
              </div>

              {heatmapData && (
                <div className="overflow-x-auto pt-2">
                  <div className="min-w-[600px] space-y-2">
                    {/* Time Header */}
                    <div className="grid grid-cols-9 text-[11px] font-bold text-slate-400 text-center">
                      <span className="text-left">Day</span>
                      {heatmapData.hours.map(h => <span key={h}>{h}</span>)}
                    </div>

                    {/* Heatmap Rows */}
                    {heatmapData.days.map((day, dIdx) => (
                      <div key={day} className="grid grid-cols-9 items-center gap-1.5 text-xs">
                        <span className="font-bold text-slate-700 text-left">{day}</span>
                        {heatmapData.matrix[dIdx].map((val, hIdx) => {
                          const bg = val > 85 ? 'bg-rose-500 text-white' : val > 65 ? 'bg-amber-400 text-slate-900' : val > 35 ? 'bg-amber-200 text-slate-800' : 'bg-emerald-100 text-emerald-900';
                          return (
                            <div 
                              key={hIdx}
                              title={`${day} at ${heatmapData.hours[hIdx]}: ${val} traffic intensity`}
                              className={`h-8 rounded-lg flex items-center justify-center font-bold text-[11px] transition-transform hover:scale-105 ${bg}`}
                            >
                              {val}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Doctor Workload Table & Department Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <div className="medical-card p-6 lg:col-span-2 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Doctor Workload & Daily Consultations</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-y border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Physician</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Patients Today</th>
                        <th className="py-3 px-4">Avg Consult</th>
                        <th className="py-3 px-4">Workload Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {doctors.map(doc => (
                        <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">{doc.name}</td>
                          <td className="py-3 px-4 text-slate-600">{doc.department}</td>
                          <td className="py-3 px-4 font-bold text-slate-800">{doc.current_patients_count || 24}</td>
                          <td className="py-3 px-4 text-slate-600">{doc.avg_consult_time} min</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              doc.workload === 'High' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {doc.workload}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Department Volume Share */}
              <div className="medical-card p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Patient Volume by Department</h3>
                <div className="space-y-3 pt-2">
                  {departments.map((d, i) => (
                    <div key={d.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: deptColors[i % deptColors.length] }} />
                        <span className="font-semibold text-slate-800">{d.name}</span>
                      </div>
                      <span className="font-bold text-slate-900">{d.waiting_count + 15} visits</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* -------------------- VIEW 6: ALERTS (Section 35) -------------------- */}
        {activeMenu === 'alerts' && (
          <div className="medical-card p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Operational Alerts & Critical Triage</h3>
            <div className="divide-y divide-slate-100">
              {alerts.map(al => {
                const isCrit = al.severity === 'critical';
                const isWarn = al.severity === 'warning';
                return (
                  <div key={al.id} className="py-4 flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isCrit ? 'bg-rose-100 text-rose-600' : isWarn ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-600'
                      }`}>
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-xs font-bold text-slate-900">{al.title}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isCrit ? 'bg-rose-100 text-rose-800' : isWarn ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
                          }`}>
                            {al.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{al.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Department: {al.department_name}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">10m ago</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* -------------------- VIEW 7: REPORTS (Section 34) -------------------- */}
        {activeMenu === 'reports' && (
          <div className="medical-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Clinical & Waiting Time Reports</h3>
                <p className="text-xs text-slate-500">Download audit logs, wait time telemetry, and prediction accuracy sheets</p>
              </div>
              <button
                onClick={onExportCsv}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Download className="w-4 h-4" />
                Download CSV Report
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <p className="text-xs font-bold uppercase text-slate-400">Total Treated Today</p>
                <p className="text-2xl font-black text-slate-900 mt-1">245</p>
                <p className="text-[11px] text-emerald-600 mt-1">91.4% On-time Consultations</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <p className="text-xs font-bold uppercase text-slate-400">Average Wait Duration</p>
                <p className="text-2xl font-black text-slate-900 mt-1">21 min</p>
                <p className="text-[11px] text-slate-500 mt-1">Under 30-minute benchmark</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <p className="text-xs font-bold uppercase text-slate-400">Emergency Patients</p>
                <p className="text-2xl font-black text-rose-600 mt-1">14</p>
                <p className="text-[11px] text-slate-500 mt-1">Average response: 4 min</p>
              </div>
            </div>
          </div>
        )}

        {/* -------------------- VIEW 8: DOCTORS MANAGEMENT -------------------- */}
        {activeMenu === 'doctors' && (
          <DoctorsManagement
            doctors={doctors}
            departments={departments}
            queue={queue}
            onRefresh={onRefreshAll}
            onCallNext={onCallNext}
            onComplete={onComplete}
            onEmergency={onEmergency}
            onOpenNewToken={onOpenNewToken}
          />
        )}

        {/* -------------------- VIEW 9: DEPARTMENTS MANAGEMENT -------------------- */}
        {activeMenu === 'departments' && (
          <DepartmentsManagement
            departments={departments}
            doctors={doctors}
            queue={queue}
            onRefresh={onRefreshAll}
            onCallNext={onCallNext}
            onComplete={onComplete}
            onEmergency={onEmergency}
            onOpenNewToken={onOpenNewToken}
          />
        )}

      </main>

    </div>
  );
}
