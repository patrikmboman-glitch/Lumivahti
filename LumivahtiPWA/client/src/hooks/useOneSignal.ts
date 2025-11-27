import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
  }
}

interface OneSignalState {
  initialized: boolean;
  subscribed: boolean;
  playerId: string | null;
  permissionStatus: "default" | "granted" | "denied" | null;
}

export function useOneSignal() {
  const initializedRef = useRef(false);
  const [state, setState] = useState<OneSignalState>({
    initialized: false,
    subscribed: false,
    playerId: null,
    permissionStatus: null,
  });

  const checkStatus = useCallback(async () => {
    if (!window.OneSignal) return;
    
    try {
      const subscribed = await window.OneSignal.User.PushSubscription.optedIn;
      const playerId = await window.OneSignal.User.PushSubscription.id;
      const permission = await window.OneSignal.Notifications.permissionNative;
      
      setState(prev => ({
        ...prev,
        subscribed: !!subscribed,
        playerId: playerId || null,
        permissionStatus: permission || null,
      }));
    } catch (error) {
      console.log("OneSignal status check error:", error);
    }
  }, []);

  useEffect(() => {
    const initOneSignal = async () => {
      if (initializedRef.current) return;

      try {
        const response = await fetch("/api/notifications/status");
        const { configured, appId } = await response.json();
        
        if (!configured || !appId) {
          console.log("OneSignal not configured - push notifications disabled");
          return;
        }

        window.OneSignalDeferred = window.OneSignalDeferred || [];
        
        if (!document.querySelector('script[src*="OneSignalSDK"]')) {
          const script = document.createElement("script");
          script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
          script.async = true;
          script.defer = true;
          document.head.appendChild(script);
        }
        
        window.OneSignalDeferred.push(async function(OneSignal: any) {
          await OneSignal.init({
            appId: appId,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: {
              enable: false,
            },
            promptOptions: {
              slidedown: {
                prompts: [{
                  type: "push",
                  autoPrompt: false,
                  text: {
                    actionMessage: "Haluatko saada ilmoituksia lumikuormasta?",
                    acceptButton: "Salli",
                    cancelButton: "Ei kiitos",
                  }
                }]
              }
            },
            welcomeNotification: {
              title: "Lumivahti",
              message: "Ilmoitukset käytössä! Saat hälytyksen kun lumikuorma kasvaa.",
            },
          });

          setState(prev => ({ ...prev, initialized: true }));
          
          OneSignal.User.PushSubscription.addEventListener("change", () => {
            checkStatus();
          });

          checkStatus();
        });

        initializedRef.current = true;
      } catch (error) {
        console.error("OneSignal initialization error:", error);
      }
    };

    initOneSignal();
  }, [checkStatus]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!window.OneSignal) {
      console.log("OneSignal not available, using native notifications");
      if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        return permission === "granted";
      }
      return false;
    }
    
    try {
      await window.OneSignal.Slidedown.promptPush();
      await new Promise(resolve => setTimeout(resolve, 500));
      await checkStatus();
      return state.subscribed;
    } catch (error) {
      console.error("Permission request error:", error);
      return false;
    }
  }, [checkStatus, state.subscribed]);

  const sendNotification = useCallback(async (
    type: "regular" | "wet-snow-warning",
    currentLoad?: number,
    alertThreshold?: number
  ): Promise<boolean> => {
    if (!state.playerId) {
      console.log("No player ID - falling back to native notification");
      if ("Notification" in window && Notification.permission === "granted") {
        let title: string;
        let body: string;
        
        if (type === "wet-snow-warning") {
          title = "Lumivahti: VAROITUS!";
          body = "Lumi raskastumassa rajusti – lauha + vesisade tulossa. Tarkista katto.";
        } else {
          title = "Lumivahti";
          body = `Lumikuorma on nyt ${currentLoad} kg/m² – lähestyy hälytysrajaa`;
        }
        
        new Notification(title, { body, icon: "/favicon.png" });
        return true;
      }
      return false;
    }

    try {
      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          currentLoad,
          alertThreshold,
          playerId: state.playerId,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("Failed to send notification:", error);
      return false;
    }
  }, [state.playerId]);

  return {
    ...state,
    requestPermission,
    sendNotification,
    checkStatus,
  };
}
