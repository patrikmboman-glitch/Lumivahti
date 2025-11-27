import { Card, CardContent } from "@/components/ui/card";
import { CloudSnow, Cloud, Sun, CloudRain, CloudSun } from "lucide-react";

interface ForecastCardProps {
  dateLabel: string;  // e.g., "Pe 28.11."
  minTemp: number;
  maxTemp: number;
  precipLabel: string;  // e.g., "0–1 mm lunta"
  icon: string;
  snowDepth?: number;  // optional for backward compatibility
}

export function ForecastCard({ 
  dateLabel, 
  minTemp, 
  maxTemp, 
  precipLabel, 
  icon,
  snowDepth 
}: ForecastCardProps) {
  const getWeatherIcon = () => {
    switch (icon) {
      case "snow":
        return <CloudSnow className="w-10 h-10 text-blue-400" />;
      case "rain":
        return <CloudRain className="w-10 h-10 text-blue-500" />;
      case "cloudy":
        return <Cloud className="w-10 h-10 text-gray-400" />;
      case "sunny":
        return <Sun className="w-10 h-10 text-yellow-400" />;
      case "partly-cloudy":
        return <CloudSun className="w-10 h-10 text-gray-300" />;
      default:
        return <Cloud className="w-10 h-10 text-gray-400" />;
    }
  };

  // Format temperature range: "-11/-6 °C"
  const tempRange = `${minTemp}/${maxTemp} °C`;

  return (
    <Card className="min-w-[110px] flex-1 shadow-sm" data-testid={`forecast-card-${dateLabel}`}>
      <CardContent className="p-3 flex flex-col items-center gap-1.5">
        <p className="text-sm font-semibold text-brand-text whitespace-nowrap">{dateLabel}</p>
        {getWeatherIcon()}
        <div className="text-center space-y-0.5">
          <p className="text-sm font-medium text-brand-text">{tempRange}</p>
          <p className="text-xs text-muted-foreground whitespace-nowrap">{precipLabel}</p>
          {snowDepth !== undefined && snowDepth > 0 && (
            <p className="text-xs text-blue-500 font-medium">↳ {snowDepth} cm</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
