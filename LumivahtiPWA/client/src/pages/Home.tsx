import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { CircularGauge } from "@/components/CircularGauge";
import { ForecastCard } from "@/components/ForecastCard";
import { Mail, RefreshCw, AlertTriangle, Droplets } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useOneSignal } from "@/hooks/useOneSignal";

interface HomeProps {
  user: {
    postalCode: string;
    roofType: string;
    roofThreshold?: number;
  };
}

interface ThawCondition {
  date: string;
  maxTemp: number;
  totalPrecip: number;
}

interface SnowData {
  currentLoad: number;
  snowDepth: number;
  threshold: number;
  status: "safe" | "moderate" | "critical";
  statusText: string;
  forecast: Array<{
    date: string;
    dayName: string;
    snowDepth: number;
    temperature: number;
    icon: string;
  }>;
  city: string;
  distanceFromKuopio: number;
  isWithinServiceArea: boolean;
  heavyWetSnowWarning: boolean;
  thawConditions: ThawCondition[];
  stationInfo: {
    name: string | null;
    distance: number | null;
    updatedAgo: string | null;
  };
}

interface LocalOrder {
  id: string;
  locationName: string;
  postalCode: string;
  roofType: string;
  snowLoad: number;
  threshold: number;
  status: string;
  createdAt: string;
}

import { ROOF_TYPES, type RoofType } from "@shared/schema";

const getEffectiveRoofThreshold = (roofType: string, customThreshold?: number): number => {
  if (roofType === "Oma raja" && customThreshold) {
    return customThreshold;
  }
  const roofTypes = ROOF_TYPES as Record<string, number>;
  return roofTypes[roofType] || 140;
};

export default function Home({ user }: HomeProps) {
  const threshold = getEffectiveRoofThreshold(user.roofType, user.roofThreshold);
  const { toast } = useToast();
  const { sendNotification, initialized: oneSignalReady } = useOneSignal();
  const lastWarningStateRef = useRef<boolean | null>(null);
  const lastAlertStateRef = useRef<boolean>(false);
  
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<SnowData>({
    queryKey: ["/api/snow-data", user.postalCode, threshold],
    queryFn: async () => {
      const response = await fetch(`/api/snow-data/${user.postalCode}?threshold=${threshold}`);
      if (!response.ok) throw new Error("Failed to fetch snow data");
      return response.json();
    },
    refetchInterval: 6 * 60 * 60 * 1000,
  });

  useEffect(() => {
    if (!data) return;
    
    const userData = JSON.parse(localStorage.getItem("lumivahti_user") || "{}");
    if (!userData.notificationsEnabled) return;

    const alertThreshold = userData.alertThreshold || Math.round(threshold * 0.8);
    
    const shouldShowWetSnowWarning = data.heavyWetSnowWarning;
    const wasWetSnowWarningShown = lastWarningStateRef.current;
    
    if (shouldShowWetSnowWarning && wasWetSnowWarningShown !== true) {
      sendNotification("wet-snow-warning");
    }
    lastWarningStateRef.current = shouldShowWetSnowWarning;

    const shouldShowRegularAlert = data.currentLoad >= alertThreshold;
    const wasRegularAlertShown = lastAlertStateRef.current;
    
    if (shouldShowRegularAlert && !wasRegularAlertShown && !shouldShowWetSnowWarning) {
      sendNotification("regular", data.currentLoad, alertThreshold);
    }
    lastAlertStateRef.current = shouldShowRegularAlert;
  }, [data, sendNotification, threshold]);

  const handleOrderService = () => {
    if (!data) {
      toast({
        title: "Virhe",
        description: "Lumikuormatietoja ei voitu ladata",
        variant: "destructive",
      });
      return;
    }

    // Save order to localStorage
    const order: LocalOrder = {
      id: crypto.randomUUID(),
      locationName: "Koti",
      postalCode: user.postalCode,
      roofType: user.roofType,
      snowLoad: data.currentLoad,
      threshold: threshold,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const existingOrders = JSON.parse(localStorage.getItem("lumivahti_orders") || "[]");
    existingOrders.push(order);
    localStorage.setItem("lumivahti_orders", JSON.stringify(existingOrders));

    toast({
      title: "Tarjouspyyntö lähetetty",
      description: "Tarjouspyyntö on tallennettu historiaan",
    });

    // Open email client
    const to = "info@pp-kattohuolto.fi";
    const subject = encodeURIComponent("Lumenpudotustarjouspyyntö – Lumivahti");
    const body = encodeURIComponent(`Hei P&P Kattohuolto,

Saapunut tarjouspyyntö Lumivahdin kautta:
Postinumero: ${user.postalCode} (${data.city}, n. ${data.distanceFromKuopio} km Kuopiosta)
Kattotyyppi: ${user.roofType}
Nykyinen lumikuorma: ${data.currentLoad} kg/m²

Ystävällisin terveisin
Lumivahti-käyttäjä`);

    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-brand-background flex flex-col pb-20">
      <div className="p-4 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <Logo />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-5 h-5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center space-y-4">
              <Skeleton className="w-[280px] h-[280px] rounded-full" />
              <Skeleton className="h-6 w-48" />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="min-w-[120px] h-[140px] rounded-xl" />
              ))}
            </div>
          </div>
        ) : isError ? (
          <Card className="border-destructive/50">
            <CardContent className="pt-6 text-center space-y-3">
              <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
              <p className="text-destructive font-medium">Tietojen lataus epäonnistui</p>
              <p className="text-sm text-muted-foreground">
                Tarkista internetyhteytesi ja yritä uudelleen
              </p>
              <Button onClick={() => refetch()} variant="outline" size="sm">
                Yritä uudelleen
              </Button>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            {data.heavyWetSnowWarning && (
              <Card className="bg-gradient-to-r from-orange-500 to-red-500 border-0 shadow-lg" data-testid="warning-heavy-wet-snow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-white/20 rounded-full p-2 flex-shrink-0">
                      <Droplets className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-white">
                      <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                        HUOM: LUMI VOI RASKAANTUA HUOMATTAVASTI!
                      </h3>
                      <p className="text-sm leading-relaxed opacity-95">
                        Ennusteessa lauhaa ja vesisadetta. Kastunut lumi on 3–5 kertaa painavampi kuin pakkaslumi.
                      </p>
                      <p className="text-sm font-semibold mt-2 opacity-95">
                        Riski: kuorma voi nousta kriittiselle tasolle yhdessä vuorokaudessa.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-col items-center">
              <CircularGauge
                currentLoad={data.currentLoad}
                threshold={data.threshold}
                status={data.status}
              />
              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  Nykyinen: {data.currentLoad} kg/m² – Turvaraja: {data.threshold} kg/m²
                </p>
                <p
                  className={`text-lg font-semibold ${
                    data.status === "safe"
                      ? "text-status-safe"
                      : data.status === "moderate"
                      ? "text-status-moderate"
                      : "text-status-critical"
                  }`}
                  data-testid="text-status"
                >
                  {data.statusText}
                </p>
                {data.stationInfo.name && (
                  <p className="text-xs text-muted-foreground mt-2" data-testid="text-station-info">
                    Lumidata: {data.stationInfo.name} ({data.stationInfo.distance} km)
                    {data.stationInfo.updatedAgo && ` – päivitetty ${data.stationInfo.updatedAgo}`}
                  </p>
                )}
                {!data.stationInfo.name && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Arvio perustuu sijaintiin ja vuodenaikaan (ei lähistöllä mittausasemaa)
                  </p>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-3 text-brand-text">
                3 päivän ennuste
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {data.forecast.map((day, index) => (
                  <ForecastCard key={index} {...day} />
                ))}
              </div>
            </div>

            {data.isWithinServiceArea ? (
              <Button
                onClick={handleOrderService}
                className="w-full h-12 bg-brand-accent hover:bg-brand-accent/90 text-white font-semibold shadow-md"
                data-testid="button-order-service"
              >
                <Mail className="mr-2 w-5 h-5" />
                Pyydä tarjouksia lumenpudotuksesta
              </Button>
            ) : (
              <Card className="bg-blue-50 border-blue-200" data-testid="info-outside-service-area">
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-blue-800 text-center leading-relaxed">
                    Lumivahdin tarjouspyyntöpalvelu toimii toistaiseksi Kuopion seudulla ja lähikunnissa (n. 80 km säteellä Kuopiosta).
                    <br />
                    <span className="font-medium">Ilmoitamme heti, kun palvelu laajenee alueellesi!</span>
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
