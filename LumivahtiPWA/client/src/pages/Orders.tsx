import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { Package, Calendar } from "lucide-react";
import { format } from "date-fns";
import { fi } from "date-fns/locale";

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

const STATUS_TRANSLATIONS: Record<string, string> = {
  pending: "Lähetetty",
  accepted: "Hyväksytty",
  in_progress: "Työn alla",
  completed: "Valmis",
  cancelled: "Peruutettu",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  accepted: "default",
  in_progress: "default",
  completed: "default",
  cancelled: "destructive",
};

export default function Orders() {
  const [orders, setOrders] = useState<LocalOrder[]>([]);

  useEffect(() => {
    const savedOrders = localStorage.getItem("lumivahti_orders");
    if (savedOrders) {
      try {
        setOrders(JSON.parse(savedOrders));
      } catch {
        setOrders([]);
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-brand-background flex flex-col pb-20">
      <div className="p-4 bg-white shadow-sm">
        <Logo />
      </div>

      <div className="flex-1 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Package className="w-6 h-6 text-brand-primary" />
          <h1 className="text-2xl font-bold text-brand-primary">Tarjouspyynnöt</h1>
        </div>

        {orders.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">Ei tarjouspyyntöjä vielä</p>
              <p className="text-sm text-muted-foreground mt-1">
                Lähetä tarjouspyyntö kotisivulta nähdäksesi ne täällä
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {orders
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((order) => (
                <Card key={order.id} data-testid={`card-order-${order.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                          Tarjouspyyntö
                          <Badge
                            variant={STATUS_VARIANTS[order.status]}
                            data-testid={`badge-order-status-${order.id}`}
                          >
                            {STATUS_TRANSLATIONS[order.status] || order.status}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(order.createdAt), "d. MMMM yyyy 'klo' HH:mm", { locale: fi })}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Sijainti:</span>
                        <p className="font-medium">{order.locationName}</p>
                        <p className="text-xs text-muted-foreground">{order.postalCode}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Lumikuorma:</span>
                        <p className="font-medium">{order.snowLoad} kg/m²</p>
                        <p className="text-xs text-muted-foreground">Raja: {order.threshold} kg/m²</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
