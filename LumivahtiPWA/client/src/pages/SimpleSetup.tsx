import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { MapPin, Home, Info, Loader2, CheckCircle } from "lucide-react";
import { ROOF_TYPES, type RoofType } from "@shared/schema";

const ROOF_TYPE_INFO: Record<RoofType, string> = {
  "Omakotitalo (kestävä)": "Uudemmissa omakotitaloissa käytetään yleensä 900 mm kattoristikoiden jakoväliä ja vahvempia rakenneratkaisuja. Virallinen lumikuormavaatimus on vähintään 180 kg/m².",
  "Vanhempi omakotitalo": "Ennen 2000-lukua rakennetuissa taloissa kattoristikoiden jakoväli on usein 1200 mm tai suurempi. Rakenteet on mitoitettu pienemmälle kuormalle, tyypillisesti 140 kg/m².",
  "Autokatos / varasto": "Kevytrakenteiset katokset ja varastot on yleensä mitoitettu vain 100 kg/m² lumikuormille. Ristikoiden jakoväli on usein 1200–1500 mm.",
  "Halli / peltikatos": "Isoissa halleissa ja peltikatoksissa jännevälit ovat usein pitkiä ja rakenne kevyempi. Lumikuormaraja on tyypillisesti 120 kg/m².",
  "Oma raja": "Jos tiedät kattosi tarkan lumikuormarajan (esim. rakennesuunnittelijan laskelmasta tai kuntotarkastusraportista), valitse tämä ja syötä arvo kg/m².",
};

const setupSchema = z.object({
  postalCode: z.string().length(5, "Postinumeron täytyy olla 5 merkkiä"),
  roofType: z.string().min(1, "Valitse kattotyyppi"),
  roofThreshold: z.number().min(50, "Vähintään 50 kg/m²").max(300, "Enintään 300 kg/m²").optional(),
});

type SetupFormData = z.infer<typeof setupSchema>;

interface SimpleSetupProps {
  onComplete: (data: SetupFormData) => void;
}

interface DetectedLocation {
  postalCode: string;
  city: string;
}

export default function SimpleSetup({ onComplete }: SimpleSetupProps) {
  const [selectedRoofType, setSelectedRoofType] = useState<RoofType | "">("");
  const [customThresholdInput, setCustomThresholdInput] = useState("");
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [detectedLocation, setDetectedLocation] = useState<DetectedLocation | null>(null);

  const form = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      postalCode: "",
      roofType: "",
      roofThreshold: undefined,
    },
  });

  useEffect(() => {
    const detectLocation = async () => {
      if (!navigator.geolocation) {
        return;
      }

      setIsDetectingLocation(true);

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000,
          });
        });

        const { latitude, longitude } = position.coords;

        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=fi`,
          {
            headers: {
              "User-Agent": "Lumivahti/1.0 (lumivahti@pp-kattohuolto.fi)",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const postalCode = data.address?.postcode;
          const city = data.address?.city || data.address?.town || data.address?.municipality || data.address?.village || "";

          if (postalCode && /^\d{5}$/.test(postalCode)) {
            form.setValue("postalCode", postalCode);
            setDetectedLocation({ postalCode, city });
          }
        }
      } catch {
        // User denied permission or error occurred - silently fail
      } finally {
        setIsDetectingLocation(false);
      }
    };

    detectLocation();
  }, [form]);

  const onSubmit = (data: SetupFormData) => {
    onComplete(data);
  };

  const handleRoofTypeChange = (value: RoofType) => {
    setSelectedRoofType(value);
    form.setValue("roofType", value);
    
    if (value !== "Oma raja") {
      form.setValue("roofThreshold", undefined);
      setCustomThresholdInput("");
    }
  };

  const handleCustomThresholdChange = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    setCustomThresholdInput(numericValue);
    const num = parseInt(numericValue, 10);
    if (!isNaN(num) && num >= 50 && num <= 300) {
      form.setValue("roofThreshold", num);
    } else if (numericValue === "") {
      form.setValue("roofThreshold", undefined);
    }
  };

  return (
    <div className="min-h-screen bg-brand-background flex flex-col">
      <div className="p-6 pb-4">
        <Logo />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-brand-primary">Aloita seuranta</CardTitle>
            <CardDescription>
              Anna tietosi lumikuorman seurantaa varten
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="postalCode" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  Postinumero
                </Label>
                <div className="relative">
                  <Input
                    id="postalCode"
                    placeholder="00100"
                    maxLength={5}
                    data-testid="input-postal-code"
                    {...form.register("postalCode")}
                  />
                  {isDetectingLocation && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                {form.formState.errors.postalCode && (
                  <p className="text-sm text-destructive">{form.formState.errors.postalCode.message}</p>
                )}
                {detectedLocation && (
                  <p className="text-sm text-green-600 flex items-center gap-1" data-testid="text-detected-location">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Havaittu sijainti: {detectedLocation.postalCode} {detectedLocation.city} (voit muuttaa)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="roofType" className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-muted-foreground" />
                  Kattotyyppi
                </Label>
                <Select onValueChange={handleRoofTypeChange} value={selectedRoofType}>
                  <SelectTrigger id="roofType" data-testid="select-roof-type">
                    <SelectValue placeholder="Valitse kattotyyppi" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROOF_TYPES).map(([type, threshold]) => (
                      <SelectItem key={type} value={type}>
                        {type} ({threshold} kg/m²)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.roofType && (
                  <p className="text-sm text-destructive">{form.formState.errors.roofType.message}</p>
                )}
                {selectedRoofType && (
                  <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg" data-testid="info-roof-type">
                    <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-800 leading-relaxed">
                      {ROOF_TYPE_INFO[selectedRoofType]}
                    </p>
                  </div>
                )}
              </div>

              {selectedRoofType === "Oma raja" && (
                <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                  <Label htmlFor="customThreshold">Katon lumikuormaraja (kg/m²)</Label>
                  <Input
                    id="customThreshold"
                    type="text"
                    inputMode="numeric"
                    placeholder="Syötä katon lumikuormaraja (kg/m²)"
                    value={customThresholdInput}
                    onChange={(e) => handleCustomThresholdChange(e.target.value)}
                    data-testid="input-custom-threshold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sallitut arvot: 50–300 kg/m²
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-brand-accent hover:bg-brand-accent/90 text-white font-semibold"
                data-testid="button-start"
              >
                Aloita seuranta
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
