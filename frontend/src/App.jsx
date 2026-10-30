import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import PatientView from './components/PatientView';
import AdminLayout from './components/AdminLayout';
import DoctorView from './components/DoctorView';
import StaffView from './components/StaffView';
import WhyThisWaitModal from './components/WhyThisWaitModal';
import RegisterPatientModal from './components/RegisterPatientModal';
import FeedbackModal from './components/FeedbackModal';
import { api } from './services/api';

export default function App() {
  const [currentRole, setCurrentRole] = useState('patient'); // patient, admin, doctor, staff
  const [currentUser, setCurrentUser] = useState({
    id: 12,
    full_name: 'John Doe',
    role: 'patient',
    email: 'john@example.com'
  });
  
  const [tokenData, setTokenData] = useState(null);
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [myVisits, setMyVisits] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [queue, setQueue] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [kpis, setKpis] = useState(null);
  
  // Sync & Loading states
  const [isSyncingModel, setIsSyncingModel] = useState(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [syncAlert, setSyncAlert] = useState(null);

  // Modals state
  const [isWhyWaitOpen, setIsWhyWaitOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [explanationData, setExplanationData] = useState(null);

  // Initial load
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem("mediwait_token");
      if (!storedToken) {
        try {
          const res = await api.switchRole(12);
          if (res && res.user) {
            setCurrentUser(res.user);
            localStorage.setItem("mediwait_token", res.access_token);
          }
        } catch (e) {
          console.error("Auth init error:", e);
        }
      }
      await refreshAllData(12);
    };
    initAuth();
  }, []);

  const refreshAllData = async (targetUserId = null, isManualRefresh = false, explicitVisitId = null) => {
    if (isManualRefresh) setIsSyncingQueue(true);
    const effectiveUserId = targetUserId || currentUser?.id || 12;
    const visitIdToFetch = explicitVisitId !== null ? explicitVisitId : selectedVisitId;

    try {
      const [deptRes, queueRes, kpiRes, alertsRes, notifRes, docsRes, tokenRes, visitsRes] = await Promise.all([
        api.getDepartments().catch(() => api.getDepartmentsWaitTimes().catch(() => [])),
        api.getQueue().catch(() => []),
        api.getKPIs().catch(() => null),
        api.getAlerts().catch(() => []),
        api.getNotifications(currentRole === 'patient' ? effectiveUserId : null).catch(() => []),
        api.getDoctors().catch(() => []),
        api.getMyToken(visitIdToFetch ? { visit_id: visitIdToFetch } : {}).catch(() => null),
        api.getMyVisits().catch(() => []),
      ]);

      if (deptRes) setDepartments(deptRes);
      if (queueRes) setQueue(queueRes);
      if (kpiRes) setKpis(kpiRes);
      if (alertsRes) setAlerts(alertsRes);
      if (notifRes) setNotifications(notifRes);
      if (docsRes) setDoctors(docsRes);
      if (visitsRes) setMyVisits(visitsRes);

      if (tokenRes) {
        setTokenData(tokenRes);
        setSelectedVisitId(tokenRes.id);
      } else if (!visitIdToFetch) {
        setTokenData(null);
        setSelectedVisitId(null);
      }

      if (isManualRefresh) {
        setSyncAlert({ type: 'success', message: 'Queue data synchronized successfully.' });
        setTimeout(() => setSyncAlert(null), 3000);
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      if (isManualRefresh) {
        setSyncAlert({ type: 'error', message: 'Failed to synchronize queue data.' });
        setTimeout(() => setSyncAlert(null), 4000);
      }
    } finally {
      if (isManualRefresh) setIsSyncingQueue(false);
    }
  };

  const handleRoleChange = async (role, userId) => {
    setCurrentRole(role);
    setSelectedVisitId(null);
    try {
      if (userId) {
        const res = await api.switchRole(userId);
        if (res && res.user) {
          setCurrentUser(res.user);
          localStorage.setItem("mediwait_token", res.access_token);
        }
      }
      await refreshAllData(userId, false, null);
    } catch (e) {
      console.error("Role switch error:", e);
    }
  };

  const handleSelectVisit = async (visitId) => {
    setSelectedVisitId(visitId);
    try {
      const entry = await api.getMyToken({ visit_id: visitId });
      if (entry) {
        setTokenData(entry);
      }
    } catch (e) {
      console.error("Failed to select visit:", e);
    }
  };

  const handleOpenWhyThisWait = async () => {
    if (!tokenData) return;
    const tokenIdentifier = tokenData.id || tokenData.token_number;
    try {
      const exp = await api.explainTokenWait(tokenIdentifier);
      setExplanationData(exp);
    } catch (err) {
      console.error("Error fetching explanation:", err);
    }
    setIsWhyWaitOpen(true);
  };

  const handleRegisterPatient = async (payload) => {
    try {
      const newEntry = await api.registerPatient(payload);
      if (newEntry && newEntry.id) {
        setSelectedVisitId(newEntry.id);
        setTokenData(newEntry);
        await refreshAllData(null, false, newEntry.id);
      } else {
        await refreshAllData();
      }
      return newEntry;
    } catch (err) {
      console.error("Registration error:", err);
      throw err;
    }
  };

  const handleCallNext = async (id) => {
    try {
      await api.callNext(id);
      await refreshAllData();
    } catch (err) {
      console.error("Call next error:", err);
    }
  };

  const handleComplete = async (id) => {
    try {
      await api.completeConsultation(id);
      await refreshAllData();
      setIsFeedbackOpen(true);
    } catch (err) {
      console.error("Complete consultation error:", err);
    }
  };

  const handleEmergency = async (id) => {
    try {
      await api.markEmergency(id);
      await refreshAllData();
    } catch (err) {
      console.error("Emergency escalation error:", err);
    }
  };

  const handleCancelToken = async (id) => {
    try {
      await api.cancelQueueEntry(id);
      await refreshAllData();
    } catch (err) {
      console.error("Cancel token error:", err);
    }
  };

  const handleRecalculate = async () => {
    setIsSyncingModel(true);
    try {
      const res = await api.recalculateQueue();
      await refreshAllData();
      setSyncAlert({ 
        type: 'success', 
        message: res?.message || 'ML prediction model and queue positions synchronized successfully.' 
      });
      setTimeout(() => setSyncAlert(null), 3500);
    } catch (err) {
      console.error("Recalculate error:", err);
      setSyncAlert({ 
        type: 'error', 
        message: 'Failed to synchronize ML predictions. Please check server status.' 
      });
      setTimeout(() => setSyncAlert(null), 4000);
    } finally {
      setIsSyncingModel(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const blob = await api.exportReportsCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mediwait_report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Export error:", err);
    }
  };

  const handleFeedbackSubmit = async (data) => {
    try {
      await api.submitFeedback(data);
    } catch (err) {
      console.error("Feedback submission error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-sky-100 selection:text-sky-900">
      
      {/* Universal Top Header */}
      <Navbar
        currentUser={currentUser}
        currentRole={currentRole}
        onRoleChange={handleRoleChange}
        notifications={notifications}
        onOpenNotifications={() => {}}
        onRecalculate={handleRecalculate}
        onNewRegistration={() => setIsRegisterOpen(true)}
        isSyncingModel={isSyncingModel}
      />

      {/* Global Sync Notification Banner */}
      {syncAlert && (
        <div className={`px-4 py-2.5 text-xs font-bold text-center transition-all ${
          syncAlert.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {syncAlert.message}
        </div>
      )}

      {/* Dynamic Role Views */}
      <div className="flex-1">
        {currentRole === 'patient' && (
          <PatientView
            currentUser={currentUser}
            tokenData={tokenData}
            departments={departments}
            queueList={queue}
            notifications={notifications}
            myVisits={myVisits}
            selectedVisitId={selectedVisitId}
            onSelectVisit={handleSelectVisit}
            onOpenWhyThisWait={handleOpenWhyThisWait}
            onOpenFeedback={() => setIsFeedbackOpen(true)}
            onOpenNewToken={() => setIsRegisterOpen(true)}
            onRefresh={() => refreshAllData(null, true)}
            isRefreshing={isSyncingQueue}
          />
        )}

        {currentRole === 'admin' && (
          <AdminLayout
            kpis={kpis}
            departments={departments}
            doctors={doctors}
            queue={queue}
            alerts={alerts}
            onCallNext={handleCallNext}
            onComplete={handleComplete}
            onEmergency={handleEmergency}
            onCancelToken={handleCancelToken}
            onRecalculate={handleRecalculate}
            onOpenNewToken={() => setIsRegisterOpen(true)}
            onExportCsv={handleExportCsv}
            onRefreshAll={() => refreshAllData(null, true)}
          />
        )}

        {currentRole === 'doctor' && (
          <DoctorView
            doctorName={currentUser.full_name || "Dr. Kumar"}
            department="Cardiology"
            queue={queue}
            onCallNext={handleCallNext}
            onComplete={handleComplete}
            onEmergency={handleEmergency}
          />
        )}

        {currentRole === 'staff' && (
          <StaffView
            staffName={currentUser.full_name || "Sarah Jenkins, RN"}
            departments={departments}
            queue={queue}
            onOpenNewToken={() => setIsRegisterOpen(true)}
            onCallNext={handleCallNext}
            onEmergency={handleEmergency}
            onRecalculate={handleRecalculate}
          />
        )}
      </div>

      {/* Global Modals */}
      <WhyThisWaitModal
        isOpen={isWhyWaitOpen}
        onClose={() => setIsWhyWaitOpen(false)}
        explanationData={explanationData}
      />

      <RegisterPatientModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        departments={departments}
        currentUser={currentUser}
        onRegistered={handleRegisterPatient}
      />

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        queueEntry={tokenData}
        onSubmit={handleFeedbackSubmit}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-4 text-center text-xs text-slate-400">
        <p>
          MediWait AI — Intelligent Hospital Waiting Time Prediction System • <span className="font-semibold text-slate-600">Your Time, Our Care</span>
        </p>
      </footer>

    </div>
  );
}
