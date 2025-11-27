import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { Save, MapPin, Home, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ROOF_TYPES, type RoofType } from "@shared/schema";
import { useOneSignal } from "@/hooks/useOneSignal";

const ROOF_TYPE_INFO: Record<RoofType, string> = {
  "Omakotitalo (kestävä)": "Uudemmissa omakotitaloissa käytetään yleensä 900 mm kattoristikoiden jakoväliä ja vahvempia rakenneratkaisuja. Virallinen lumikuormavaatimus on vähintään 180 kg/m².",
  "Vanhempi omakotitalo": "Ennen 2000-lukua rakennetuissa taloissa kattoristikoiden jakoväli on usein 1200 mm tai suurempi. Rakenteet on mitoitettu pienemmälle kuormalle, tyypillisesti 140 kg/m².",
  "Autokatos / varasto": "Kevytrakenteiset katokset ja varastot on yleensä mitoitettu vain 100 kg/m² lumikuormille. Ristikoiden jakoväli on usein 1200–1500 mm.",
  "Halli / peltikatos": "Isoissa halleissa ja peltikatoksissa jännevälit ovat usein pitkiä ja rakenne kevyempi. Lumikuormaraja on tyypillisesti 120 kg/m².",
  "Oma raja": "Jos tiedät kattosi tarkan lumikuormarajan (esim. rakennesuunnittelijan laskelmasta tai kuntotarkastusraportista), valitse tämä ja syötä arvo kg/m².",
};

interface SettingsProps {
  user: {
    postalCode: string;
    roofType: string;
    roofThreshold?: number;
    alertThreshold?: number;
    notificationsEnabled: boolean;
  };
  onUpdateSettings: (settings: { 
    postalCode?: string;
    roofType?: string;
    roofThreshold?: number;
    alertThreshold?: number;
    notificationsEnabled?: boolean;
  }) => void;
}

const DEFAULT_ROOF_TYPE: RoofType = "Omakotitalo (kestävä)";

const isValidRoofType = (value: string): value is RoofType => {
  return Object.keys(ROOF_TYPES).includes(value);
};

const getEffectiveRoofThreshold = (roofType: RoofType, customThreshold?: number): number => {
  if (roofType === "Oma raja" && customThreshold) {
    return customThreshold;
  }
  return ROOF_TYPES[roofType] || 140;
};

export default function Settings({ user, onUpdateSettings }: SettingsProps) {
  const [postalCode, setPostalCode] = useState(user.postalCode);
  const [roofType, setRoofType] = useState<RoofType>(
    isValidRoofType(user.roofType) ? user.roofType : DEFAULT_ROOF_TYPE
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(user.notificationsEnabled);
  const [customRoofThreshold, setCustomRoofThreshold] = useState(user.roofThreshold?.toString() || "");
  const { toast } = useToast();
  const { requestPermission, subscribed } = useOneSignal();

  const effectiveRoofThreshold = getEffectiveRoofThreshold(
    roofType, 
    roofType === "Oma raja" ? parseInt(customRoofThreshold, 10) || undefined : undefined
  );
  
  const defaultAlertThreshold = Math.min(Math.round(effectiveRoofThreshold * 0.8), 200);
  const [alertThreshold, setAlertThreshold] = useState(user.alertThreshold || defaultAlertThreshold);

  const hasLocationChanges = postalCode !== user.postalCode || 
    roofType !== user.roofType || 
    (roofType === "Oma raja" && customRoofThreshold !== (user.roofThreshold?.toString() || ""));
  const isValidPostalCode = postalCode.length === 5 && /^\d{5}$/.test(postalCode);
  const isValidCustomThreshold = roofType !== "Oma raja" || 
    (customRoofThreshold !== "" && parseInt(customRoofThreshold, 10) >= 50 && parseInt(customRoofThreshold, 10) <= 300);

  const handleSaveLocation = () => {
    if (!isValidPostalCode) {
      toast({
        title: "Virhe",
        description: "Postinumeron täytyy olla 5 numeroa.",
        variant: "destructive",
      });
      return;
    }

    if (!isValidCustomThreshold) {
      toast({
        title: "Virhe",
        description: "Syötä kelvollinen lumikuormaraja (50–300 kg/m²).",
        variant: "destructive",
      });
      return;
    }

    onUpdateSettings({
      postalCode,
      roofType,
      roofThreshold: roofType === "Oma raja" ? parseInt(customRoofThreshold, 10) : undefined,
    });
    toast({
      title: "Sijainti päivitetty",
      description: "Lumikuormatiedot päivitetään uudelle sijainnille.",
    });
  };

  const handleRoofTypeChange = (value: RoofType) => {
    setRoofType(value);
    if (value !== "Oma raja") {
      setCustomRoofThreshold("");
    }
  };

  const handleCustomThresholdChange = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    setCustomRoofThreshold(numericValue);
  };

  const handleNotificationsToggle = async (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    
    if (enabled) {
      const granted = await requestPermission();
      if (!granted) {
        toast({
          title: "Ilmoitukset",
          description: "Ilmoituslupa evätty. Voit sallia ilmoitukset selaimen asetuksista.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Ilmoitukset käytössä",
          description: "Saat nyt ilmoituksia lumikuorman muutoksista.",
        });
      }
    }
  };

  const handleSave = () => {
    onUpdateSettings({
      alertThreshold,
      notificationsEnabled,
    });
    toast({
      title: "Asetukset tallennettu",
      description: "Muutokset on päivitetty onnistuneesti.",
    });
  };

  return (
    <div className="min-h-screen bg-brand-background flex flex-col pb-20">
      <div className="p-4 bg-white shadow-sm">
        <Logo />
      </div>

      <div className="flex-1 px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Kohteen tiedot</CardTitle>
            <CardDescription>Muuta sijaintia tai kattotyyppiä</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="postalCode" className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Postinumero
              </Label>
              <Input
                id="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="00100"
                maxLength={5}
                data-testid="input-settings-postal-code"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="roofType" className="flex items-center gap-2">
                <Home className="w-4 h-4 text-muted-foreground" />
                Kattotyyppi
              </Label>
              <Select onValueChange={handleRoofTypeChange} value={roofType}>
                <SelectTrigger id="roofType" data-testid="select-settings-roof-type">
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
              {roofType && (
                <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg" data-testid="info-settings-roof-type">
                  <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-800 leading-relaxed">
                    {ROOF_TYPE_INFO[roofType]}
                  </p>
                </div>
              )}
              {roofType === "Oma raja" && (
                <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                  <Label htmlFor="customRoofThreshold">Katon lumikuormaraja (kg/m²)</Label>
                  <Input
                    id="customRoofThreshold"
                    type="text"
                    inputMode="numeric"
                    placeholder="Syötä katon lumikuormaraja (kg/m²)"
                    value={customRoofThreshold}
                    onChange={(e) => handleCustomThresholdChange(e.target.value)}
                    data-testid="input-settings-custom-threshold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sallitut arvot: 50–300 kg/m²
                  </p>
                </div>
              )}
            </div>

            <Button
              onClick={handleSaveLocation}
              disabled={!hasLocationChanges || !isValidPostalCode}
              className="w-full h-11 bg-brand-accent hover:bg-brand-accent/90 text-white font-semibold disabled:opacity-50"
              data-testid="button-save-location"
            >
              <Save className="mr-2 w-5 h-5" />
              Tallenna muutokset
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ilmoitukset</CardTitle>
            <CardDescription>Hallinnoi ilmoitusasetuksia</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notifications" className="text-base font-medium">
                  Ilmoitukset
                </Label>
                <p className="text-sm text-muted-foreground">
                  Vastaanota varoituksia lumikuormasta
                </p>
              </div>
              <Switch
                id="notifications"
                checked={notificationsEnabled}
                onCheckedChange={handleNotificationsToggle}
                data-testid="switch-notifications"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hälytysraja</CardTitle>
            <CardDescription>Milloin saat push-ilmoituksen lumikuormasta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="alertThreshold">Hälytysraja</Label>
                <span className="text-2xl font-bold text-brand-primary" data-testid="text-alert-threshold">
                  {alertThreshold} kg/m²
                </span>
              </div>
              <Slider
                id="alertThreshold"
                min={50}
                max={200}
                step={5}
                value={[alertThreshold]}
                onValueChange={(value) => setAlertThreshold(value[0])}
                className="w-full"
                data-testid="slider-alert-threshold"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>50 kg/m²</span>
                <span>200 kg/m²</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Huom: Tämä raja koskee vain ilmoituksia. Mittarin värit perustuvat katon todelliseen lumikuormarajaan ({effectiveRoofThreshold} kg/m²).
              </p>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          className="w-full h-11 bg-brand-accent hover:bg-brand-accent/90 text-white font-semibold"
          data-testid="button-save-settings"
        >
          <Save className="mr-2 w-5 h-5" />
          Tallenna asetukset
        </Button>
      </div>
    </div>
  );
}
