import { FormEvent, useState } from "react";
import { useAppShell } from "../contexts/AppShellContext";

export function useSecretDashboard() {
  const { setActiveTab } = useAppShell();
  const [showDashboard, setShowDashboard] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinCode, setPinCode] = useState("");
  const [pinError, setPinError] = useState(false);

  const openSecretPinModal = () => {
    setShowPinModal(true);
    setPinCode("");
    setPinError(false);
  };

  const handlePinSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (pinCode === "1984") {
      if (showDashboard) {
        setShowDashboard(false);
        setActiveTab("cargo");
      } else {
        setShowDashboard(true);
        setActiveTab("dashboard");
      }
      setShowPinModal(false);
      setPinCode("");
      setPinError(false);
    } else {
      setPinError(true);
      setPinCode("");
    }
  };

  return {
    showDashboard,
    showPinModal,
    setShowPinModal,
    pinCode,
    setPinCode,
    pinError,
    setPinError,
    openSecretPinModal,
    handlePinSubmit,
  };
}
