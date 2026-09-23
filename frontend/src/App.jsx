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
    id: 10,
    full_name: 'John Doe',
    role: 'patient',
    email: 'john@example.com'
  });
  
  const [tokenData, setTokenData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [queue, setQueue] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [kpis, setKpis] = useState(null);
  
  // Modals state
  const [isWhyWaitOpen, setIsWhyWaitOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [explanationData, setExplanationData] = useState(null);

  // Initial load
  useEffect(() => {
    refreshAllData();
  }, []);

  const refreshAllData = async () => {
    try {
      const [deptRes, queueRes, kpiRes, alertsRes, notifRes, docsRes, tokenRes] = await Promise.all([
        api.getDepartmentsWaitTimes().catch(() => []),
        api.getQueue().catch(() => []),
        api.getKPIs().catch(() => null),
        api.getAlerts().catch(() => []),
        api.getNotifications().catch(() => []),
        api.getDoctors().catch(() => []),
        api.getMyToken("A-127").catch(() => null),
      ]);

      if (deptRes) setDepartments(deptRes);
      if (queueRes) setQueue(queueRes);
      if (kpiRes) setKpis(kpiRes);
      if (alertsRes) setAlerts(alertsRes);
      if (notifRes) setNotifications(notifRes);
      if (docsRes) setDoctors(docsRes);
      if (tokenRes) setTokenData(tokenRes);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    }
  };

  const handleRoleChange = async (role, userId) => {
    setCurrentRole(role);
    try {
      if (userId) {
        const res = await api.switchRole(userId);
        if (res && res.user) {
          setCurrentUser(res.user);
          localStorage.setItem("mediwait_token", res.access_token);
        }
      }
      refreshAllData();
    } catch (e) {
      console.error("Role switch error:", e);
    }
  };

  const handleOpenWhyThisWait = async () => {
    const tokenNum = tokenData?.token_number || "A-127";
    try {
      const exp = await api.explainTokenWait(tokenNum);
      setExplanationData(exp);
    } catch (err) {
      console.error("Error fetching explanation:", err);
    }
    setIsWhyWaitOpen(true);
  };

  const handleRegisterPatient = async (payload) => {
    try {
      const newEntry = await api.registerPatient(payload);
      setTokenData(newEntry);
      refreshAllData();
      return newEntry;
    } catch (err) {
      console.error("Registration error:", err);
      throw err;
    }
  };

  const handleCallNext = async (id) => {
    try {
      await api.callNext(id);
      refreshAllData();
    } catch (err) {
      console.error("Call next error:", err);
    }
  };

  const handleComplete = async (id) => {
    try {
      await api.completeConsultation(id);
      refreshAllData();
      setIsFeedbackOpen(true);
    } catch (err) {
      console.error("Complete consultation error:", err);
    }
  };

  const handleEmergency = async (id) => {
    try {
      await api.markEmergency(id);
      refreshAllData();
    } catch (err) {
      console.error("Emergency escalation error:", err);
    }
  };

  const handleCancelToken = async (id) => {
    try {
      await api.cancelQueueEntry(id);
      refreshAllData();
    } catch (err) {
      console.error("Cancel token error:", err);
    }
  };

  const handleRecalculate = async () => {
    try {
      await api.recalculateQueue();
      refreshAllData();
    } catch (err) {
      console.error("Recalculate error:", err);
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
      />

      {/* Dynamic Role Views */}
      <div className="flex-1">
        {currentRole === 'patient' && (
          <PatientView
            tokenData={tokenData}
            departments={departments}
            queueList={queue}
            notifications={notifications}
            onOpenWhyThisWait={handleOpenWhyThisWait}
            onOpenFeedback={() => setIsFeedbackOpen(true)}
            onOpenNewToken={() => setIsRegisterOpen(true)}
            onRefresh={refreshAllData}
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
