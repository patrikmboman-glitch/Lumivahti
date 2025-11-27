import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, getQueryFn } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Onboarding from "@/pages/Onboarding";
import Home from "@/pages/Home";
import Settings from "@/pages/Settings";
import Orders from "@/pages/Orders";
import SimpleSetup from "@/pages/SimpleSetup";
import { Home as HomeIcon, Settings as SettingsIcon, Package } from "lucide-react";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
  }
}

type AppState = "onboarding" | "setup" | "main";
type MainTab = "home" | "orders" | "settings";

interface UserData {
  postalCode: string;
  roofType: string;
  roofThreshold?: number;
  alertThreshold?: number;
  notificationsEnabled: boolean;
}

function App() {
  const [appState, setAppState] = useState<AppState>("onboarding");
  const [activeTab, setActiveTab] = useState<MainTab>("home");
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("lumivahti_user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUserData(parsed);
        setAppState("main");
      } catch {
        localStorage.removeItem("lumivahti_user");
      }
    }
  }, []);

  const handleOnboardingComplete = () => {
    setAppState("setup");
  };

  const handleSetupComplete = (data: { postalCode: string; roofType: string; roofThreshold?: number }) => {
    const userToStore: UserData = {
      postalCode: data.postalCode,
      roofType: data.roofType,
      roofThreshold: data.roofThreshold,
      notificationsEnabled: true,
    };
    setUserData(userToStore);
    localStorage.setItem("lumivahti_user", JSON.stringify(userToStore));
    if ((window as any).plausible) (window as any).plausible('PostalCode', { props: { code: data.postalCode } });
    setAppState("main");
  };

  const handleUpdateSettings = async (settings: {
    postalCode?: string;
    roofType?: string;
    roofThreshold?: number;
    alertThreshold?: number;
    notificationsEnabled?: boolean;
  }) => {
    if (!userData) return;

    const locationChanged = settings.postalCode !== undefined && settings.postalCode !== userData.postalCode;
    const roofTypeChanged = settings.roofType !== undefined && settings.roofType !== userData.roofType;
    const oldPostalCode = userData.postalCode;
    
    const updatedUser: UserData = {
      ...userData,
      ...settings,
    };
    setUserData(updatedUser);
    localStorage.setItem("lumivahti_user", JSON.stringify(updatedUser));
    
    if (locationChanged || roofTypeChanged) {
      if (locationChanged && oldPostalCode !== updatedUser.postalCode) {
        queryClient.removeQueries({ queryKey: ['/api/snow-data', oldPostalCode] });
        if ((window as any).plausible) (window as any).plausible('PostalCode', { props: { code: updatedUser.postalCode } });
      }
      queryClient.removeQueries({ queryKey: ['/api/snow-data', updatedUser.postalCode] });
      await queryClient.fetchQuery({
        queryKey: ['/api/snow-data', updatedUser.postalCode],
        queryFn: getQueryFn({ on401: 'throw' }),
      });
      setActiveTab("home");
    }
  };

  if (appState === "onboarding") {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Onboarding onComplete={handleOnboardingComplete} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  if (appState === "setup") {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SimpleSetup onComplete={handleSetupComplete} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="relative">
          {activeTab === "home" && userData && <Home user={userData} />}
          {activeTab === "orders" && <Orders />}
          {activeTab === "settings" && userData && (
            <Settings
              user={userData}
              onUpdateSettings={handleUpdateSettings}
            />
          )}

          <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-lg safe-area-bottom z-50">
            <div className="flex h-16">
              <button
                onClick={() => setActiveTab("home")}
                className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                  activeTab === "home"
                    ? "text-brand-accent"
                    : "text-muted-foreground"
                }`}
                data-testid="tab-home"
              >
                <HomeIcon className="w-6 h-6" />
                <span className={`text-xs ${activeTab === "home" ? "font-semibold" : "font-medium"}`}>
                  Koti
                </span>
              </button>
              <button
                onClick={() => setActiveTab("orders")}
                className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                  activeTab === "orders"
                    ? "text-brand-accent"
                    : "text-muted-foreground"
                }`}
                data-testid="tab-orders"
              >
                <Package className="w-6 h-6" />
                <span className={`text-xs ${activeTab === "orders" ? "font-semibold" : "font-medium"}`}>
                  Tarjouspyynnöt
                </span>
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                  activeTab === "settings"
                    ? "text-brand-accent"
                    : "text-muted-foreground"
                }`}
                data-testid="tab-settings"
              >
                <SettingsIcon className="w-6 h-6" />
                <span className={`text-xs ${activeTab === "settings" ? "font-semibold" : "font-medium"}`}>
                  Asetukset
                </span>
              </button>
            </div>
          </nav>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
