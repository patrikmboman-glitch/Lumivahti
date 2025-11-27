import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ChevronRight, CloudSnow, MapPin, Shield } from "lucide-react";

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      icon: CloudSnow,
      title: "Lumivahti",
      subtitle: "Varoittaa ennen kuin kattosi romahtaa",
      description: "Älykäs lumikuorman seuranta suomalaisille katoille",
    },
    {
      icon: MapPin,
      title: "Seuraa lumikuormaa reaaliajassa",
      subtitle: "postinumerollasi",
      description: "Tarkka lumikuorman arvio perustuen Ilmatieteen laitoksen mittauksiin",
    },
    {
      icon: Shield,
      title: "Valitse kattotyyppisi",
      subtitle: "tarkan riskirajan laskemiseksi",
      description: "Saat henkilökohtaisen varoituksen kun kattosi turvallisuus on uhattuna",
    },
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-brand-primary via-brand-primary to-purple-900 flex flex-col">
      <div className="flex justify-between items-center p-4 safe-area-top">
        {currentSlide === 0 && (
          <div className="flex-1">
            <Logo className="text-white" />
          </div>
        )}
        {currentSlide !== 0 && <div className="flex-1" />}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSkip}
          className="text-white hover:bg-white/10"
          data-testid="button-skip-onboarding"
        >
          Ohita
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-32">
        <div className="w-full max-w-md flex flex-col items-center text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-32 h-32 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
            {slides[currentSlide].icon && (() => {
              const IconComponent = slides[currentSlide].icon;
              return <IconComponent className="w-16 h-16 text-white" strokeWidth={1.5} />;
            })()}
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-bold text-white leading-tight">
              {slides[currentSlide].title}
            </h1>
            <p className="text-xl text-white/90 font-medium">
              {slides[currentSlide].subtitle}
            </p>
            <p className="text-base text-white/70 leading-relaxed max-w-sm mx-auto">
              {slides[currentSlide].description}
            </p>
          </div>
        </div>
      </div>

      <div className="pb-safe px-6 pb-8 space-y-6">
        <div className="flex justify-center gap-2">
          {slides.map((_, index) => (
            <div
              key={index}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentSlide
                  ? "w-8 bg-brand-accent"
                  : "w-2 bg-white/30"
              }`}
            />
          ))}
        </div>

        <Button
          size="lg"
          onClick={handleNext}
          className="w-full h-12 bg-brand-accent hover:bg-brand-accent/90 text-white font-semibold text-base shadow-lg"
          data-testid="button-next-onboarding"
        >
          {currentSlide === slides.length - 1 ? "Aloita" : "Seuraava"}
          <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
