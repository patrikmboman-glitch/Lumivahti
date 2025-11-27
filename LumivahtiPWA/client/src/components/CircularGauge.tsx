interface CircularGaugeProps {
  currentLoad: number;
  threshold: number;
  status: "safe" | "moderate" | "critical";
}

export function CircularGauge({ currentLoad, threshold, status }: CircularGaugeProps) {
  const percentage = Math.min((currentLoad / threshold) * 100, 100);
  const radius = 120;
  const strokeWidth = 24;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    switch (status) {
      case "safe":
        return "#22c55e";
      case "moderate":
        return "#eab308";
      case "critical":
        return "#ef4444";
      default:
        return "#22c55e";
    }
  };

  return (
    <div className="relative inline-flex items-center justify-center" data-testid="gauge-container">
      <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
        <circle
          stroke="#e5e7eb"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={getColor()}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          style={{
            strokeDashoffset,
            transition: "stroke-dashoffset 0.8s ease-out, stroke 0.3s ease",
          }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold text-brand-text" data-testid="text-current-load">
          {currentLoad}
        </span>
        <span className="text-sm text-muted-foreground font-medium">kg/m²</span>
      </div>
    </div>
  );
}
