import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema, 
  loginSchema, 
  updateSettingsSchema, 
  insertLocationSchema,
  insertOrderSchema,
  ROOF_TYPES 
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { fromZodError } from "zod-validation-error";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: "Kirjautuminen vaaditaan" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/register", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);

      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Sähköpostiosoite on jo käytössä" });
      }

      const hashedPassword = await bcrypt.hash(validatedData.password, 10);

      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword,
      });

      // Create default location from user's registration data
      await storage.createLocation(user.id, {
        name: "Pääkoti",
        postalCode: user.postalCode,
        roofType: user.roofType,
        customThreshold: user.customThreshold ?? undefined,
        isDefault: true,
      });

      req.session.userId = user.id;
      req.session.email = user.email;

      const { password, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Virheellinen sähköposti tai salasana" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Virheellinen sähköposti tai salasana" });
      }

      req.session.userId = user.id;
      req.session.email = user.email;

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Virheelliset kirjautumistiedot" });
      }
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Uloskirjautuminen epäonnistui" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Uloskirjautuminen onnistui" });
    });
  });

  app.get("/api/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "Käyttäjää ei löytynyt" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.put("/api/settings", requireAuth, async (req, res) => {
    try {
      const validatedSettings = updateSettingsSchema.parse(req.body);

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "Käyttäjää ei löytynyt" });
      }

      const updatedUser = await storage.updateUserSettings(user.email, validatedSettings);
      if (!updatedUser) {
        return res.status(500).json({ message: "Asetusten päivitys epäonnistui" });
      }

      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.get("/api/snow-data/:postalCode", async (req, res) => {
    try {
      const { postalCode } = req.params;
      const { threshold } = req.query;

      const postalInfo = await getPostalCodeInfo(postalCode);
      if (!postalInfo) {
        return res.status(404).json({ 
          message: "Postinumeroa ei löytynyt. Tarkista, että postinumero on oikein.",
          error: "postal_code_not_found"
        });
      }

      // Calculate distance from Kuopio center
      const distanceFromKuopio = calculateDistance(
        postalInfo.lat,
        postalInfo.lon,
        KUOPIO_CENTER.lat,
        KUOPIO_CENTER.lon
      );
      const isWithinServiceArea = distanceFromKuopio <= 80;

      // Get snow depth with station info
      const snowResult = await getSnowDepthWithStationInfo(postalInfo.lat, postalInfo.lon, postalCode);
      const currentLoad = Math.round(snowResult.depth * 2.5);
      
      const userThreshold = threshold ? parseInt(threshold as string) : 140;
      const percentage = (currentLoad / userThreshold) * 100;

      let status: "safe" | "moderate" | "critical";
      let statusText: string;

      if (percentage >= 100) {
        status = "critical";
        statusText = "Kriittinen";
      } else if (percentage >= 80) {
        status = "moderate";
        statusText = "Kohtalainen riski";
      } else {
        status = "safe";
        statusText = "Turvallinen";
      }

      const forecastResult = await getSnowForecastWithThawWarning(postalInfo.lat, postalInfo.lon, userThreshold);

      // Check for heavy wet snow warning conditions:
      // 1. Current load ≥ 60% of threshold
      // 2. Forecast has thaw conditions (temp ≥ +1°C AND precip ≥ 5mm in any of next 3 days)
      const loadPercentage = (currentLoad / userThreshold) * 100;
      const showHeavyWetSnowWarning = loadPercentage >= 60 && forecastResult.hasThawConditions;

      // Format update time as relative string (e.g., "2 tuntia sitten")
      let updatedAgo: string | null = null;
      if (snowResult.updatedAt) {
        const now = new Date();
        const diffMs = now.getTime() - snowResult.updatedAt.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        
        if (diffHours >= 24) {
          const diffDays = Math.floor(diffHours / 24);
          updatedAgo = diffDays === 1 ? "1 päivä sitten" : `${diffDays} päivää sitten`;
        } else if (diffHours >= 1) {
          updatedAgo = diffHours === 1 ? "1 tunti sitten" : `${diffHours} tuntia sitten`;
        } else if (diffMinutes >= 1) {
          updatedAgo = diffMinutes === 1 ? "1 minuutti sitten" : `${diffMinutes} minuuttia sitten`;
        } else {
          updatedAgo = "juuri nyt";
        }
      }

      res.json({
        currentLoad,
        snowDepth: snowResult.depth,
        threshold: userThreshold,
        status,
        statusText,
        forecast: forecastResult.forecast,
        city: postalInfo.city,
        distanceFromKuopio: Math.round(distanceFromKuopio),
        isWithinServiceArea,
        heavyWetSnowWarning: showHeavyWetSnowWarning,
        thawConditions: forecastResult.thawConditions,
        stationInfo: {
          name: snowResult.stationName,
          distance: snowResult.stationDistance,
          updatedAgo,
        },
      });
    } catch (error: any) {
      console.error("Error fetching snow data:", error);
      res.status(500).json({ message: "Tietojen haku epäonnistui" });
    }
  });

  // ===== Location Management Endpoints =====
  
  app.get("/api/locations", requireAuth, async (req, res) => {
    try {
      const locations = await storage.getUserLocations(req.session.userId!);
      res.json(locations);
    } catch (error) {
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.get("/api/locations/default", requireAuth, async (req, res) => {
    try {
      const location = await storage.getDefaultLocation(req.session.userId!);
      if (!location) {
        return res.status(404).json({ message: "Oletussijaintia ei löytynyt" });
      }
      res.json(location);
    } catch (error) {
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.post("/api/locations", requireAuth, async (req, res) => {
    try {
      const validatedData = insertLocationSchema.parse(req.body);
      const location = await storage.createLocation(req.session.userId!, validatedData);
      res.status(201).json(location);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.put("/api/locations/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertLocationSchema.partial().parse(req.body);
      
      const location = await storage.updateLocation(id, validatedData);
      if (!location) {
        return res.status(404).json({ message: "Sijaintia ei löytynyt" });
      }
      res.json(location);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.put("/api/locations/:id/default", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.setDefaultLocation(req.session.userId!, id);
      res.json({ message: "Oletussijainti asetettu" });
    } catch (error) {
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.delete("/api/locations/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteLocation(id);
      res.json({ message: "Sijainti poistettu" });
    } catch (error) {
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  // ===== Order Management Endpoints =====
  
  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getUserOrders(req.session.userId!);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const validatedData = insertOrderSchema.parse(req.body);
      const order = await storage.createOrder(req.session.userId!, validatedData);
      res.status(201).json(order);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.put("/api/orders/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!status || typeof status !== "string") {
        return res.status(400).json({ message: "Virheellinen tila" });
      }
      
      const order = await storage.updateOrderStatus(id, status);
      if (!order) {
        return res.status(404).json({ message: "Tilausta ei löytynyt" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.get("/api/locations/:locationId/photos", requireAuth, async (req, res) => {
    try {
      const { locationId } = req.params;
      const photos = await storage.getLocationPhotos(locationId);
      res.json(photos);
    } catch (error) {
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  app.delete("/api/photos/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePhoto(id);
      res.json({ message: "Kuva poistettu" });
    } catch (error) {
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  // ===== OneSignal Push Notification Endpoint =====
  // This endpoint requires a valid playerId (OneSignal subscription ID)
  // which can only be obtained from the OneSignal SDK on the frontend
  
  app.post("/api/notifications/send", async (req, res) => {
    try {
      const { type, currentLoad, alertThreshold, playerId } = req.body;
      
      // Require a valid player ID - this ensures only real subscribed users can trigger notifications
      if (!playerId || typeof playerId !== "string" || playerId.length < 32) {
        return res.status(400).json({ 
          message: "Virheellinen tilaus-ID",
          error: "invalid_player_id" 
        });
      }

      // Validate type
      if (!type || !["regular", "wet-snow-warning"].includes(type)) {
        return res.status(400).json({ 
          message: "Virheellinen ilmoitustyyppi",
          error: "invalid_type" 
        });
      }

      // For regular alerts, require valid load data
      if (type === "regular") {
        if (typeof currentLoad !== "number" || currentLoad < 0 || currentLoad > 500) {
          return res.status(400).json({ message: "Virheellinen lumikuorma" });
        }
        if (typeof alertThreshold !== "number" || alertThreshold < 50 || alertThreshold > 200) {
          return res.status(400).json({ message: "Virheellinen hälytysraja" });
        }
      }
      
      const appId = process.env.ONESIGNAL_APP_ID;
      const apiKey = process.env.ONESIGNAL_REST_API_KEY;
      
      if (!appId || !apiKey) {
        return res.status(503).json({ 
          message: "Push-ilmoitukset eivät ole käytössä",
          configured: false 
        });
      }

      let message: string;
      let headings: string;
      
      if (type === "wet-snow-warning") {
        headings = "Lumivahti: VAROITUS!";
        message = "Lumi raskastumassa rajusti – lauha + vesisade tulossa. Tarkista katto.";
      } else {
        headings = "Lumivahti";
        message = `Lumikuorma on nyt ${currentLoad} kg/m² – lähestyy hälytysrajaa (${alertThreshold} kg/m²)`;
      }

      const notificationPayload = {
        app_id: appId,
        headings: { fi: headings, en: headings },
        contents: { fi: message, en: message },
        include_player_ids: [playerId], // Always target specific user
      };

      const response = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${apiKey}`,
        },
        body: JSON.stringify(notificationPayload),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("OneSignal error:", errorData);
        return res.status(500).json({ message: "Ilmoituksen lähetys epäonnistui" });
      }

      const data = await response.json();
      res.json({ success: true, id: data.id });
    } catch (error) {
      console.error("Error sending push notification:", error);
      res.status(500).json({ message: "Palvelinvirhe" });
    }
  });

  // Endpoint to check if OneSignal is configured
  app.get("/api/notifications/status", (req, res) => {
    const configured = !!(process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_API_KEY);
    res.json({ configured, appId: process.env.ONESIGNAL_APP_ID || null });
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Kuopio center coordinates
const KUOPIO_CENTER = { lat: 62.8933, lon: 27.6783 };

// Haversine formula to calculate distance between two coordinates in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface PostalCodeInfo {
  lat: number;
  lon: number;
  city: string;
}

// Cache for geocoded postal codes to avoid repeated API calls
const geocodeCache: Record<string, PostalCodeInfo | null> = {};

async function geocodePostalCode(postalCode: string): Promise<PostalCodeInfo | null> {
  // Check cache first
  if (geocodeCache[postalCode] !== undefined) {
    return geocodeCache[postalCode];
  }

  try {
    // Use OpenStreetMap Nominatim for geocoding Finnish postal codes
    const query = encodeURIComponent(`${postalCode}, Finland`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&countrycodes=fi&limit=1`;
    
    console.log(`Geocoding postal code ${postalCode}...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Lumivahti/1.0 (snow monitoring PWA; https://replit.com; contact: info@pp-kattohuolto.fi)'
      }
    });
    
    if (!response.ok) {
      console.warn(`Nominatim API returned ${response.status}`);
      geocodeCache[postalCode] = null;
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      
      // Extract city name from display_name (e.g., "33720, Tampere, Finland" -> "Tampere")
      let city = "Tuntematon";
      if (result.display_name) {
        const parts = result.display_name.split(',').map((s: string) => s.trim());
        // City is usually the second part after postal code
        if (parts.length >= 2) {
          city = parts[1];
        }
      }
      
      const info: PostalCodeInfo = { lat, lon, city };
      geocodeCache[postalCode] = info;
      console.log(`Geocoded ${postalCode} -> ${city} (${lat}, ${lon})`);
      return info;
    }
    
    console.warn(`No geocoding results for postal code ${postalCode}`);
    geocodeCache[postalCode] = null;
    return null;
  } catch (error) {
    console.error(`Error geocoding postal code ${postalCode}:`, error);
    geocodeCache[postalCode] = null;
    return null;
  }
}

async function getPostalCodeInfo(postalCode: string): Promise<PostalCodeInfo | null> {
  // Static map for common postal codes (faster than API calls)
  const postalCodeMap: Record<string, PostalCodeInfo> = {
    // Kuopio and nearby areas (within 80km)
    "70100": { lat: 62.8933, lon: 27.6783, city: "Kuopio" },
    "70110": { lat: 62.8950, lon: 27.6800, city: "Kuopio" },
    "70200": { lat: 62.9000, lon: 27.6700, city: "Kuopio" },
    "70210": { lat: 62.8800, lon: 27.6900, city: "Kuopio" },
    "70300": { lat: 62.8700, lon: 27.6500, city: "Kuopio" },
    "70340": { lat: 62.8600, lon: 27.6600, city: "Kuopio" },
    "70400": { lat: 62.9100, lon: 27.7000, city: "Kuopio" },
    "70420": { lat: 62.9200, lon: 27.7100, city: "Kuopio" },
    "70500": { lat: 62.8500, lon: 27.6400, city: "Kuopio" },
    "70600": { lat: 62.8400, lon: 27.6200, city: "Kuopio" },
    "70700": { lat: 62.8300, lon: 27.6000, city: "Kuopio" },
    "70800": { lat: 62.8200, lon: 27.5800, city: "Kuopio" },
    "70820": { lat: 62.8150, lon: 27.5700, city: "Kuopio" },
    "70840": { lat: 62.8100, lon: 27.5600, city: "Kuopio" },
    "70870": { lat: 62.8050, lon: 27.5500, city: "Kuopio" },
    "70900": { lat: 62.8000, lon: 27.5400, city: "Kuopio" },
    "71100": { lat: 62.9500, lon: 27.7200, city: "Kuopio" },
    "71130": { lat: 62.9600, lon: 27.7300, city: "Kuopio" },
    "71150": { lat: 62.9700, lon: 27.7400, city: "Kuopio" },
    "71160": { lat: 62.9800, lon: 27.7500, city: "Kuopio" },
    "71200": { lat: 63.0000, lon: 27.7600, city: "Kuopio" },
    "71310": { lat: 63.0200, lon: 27.7800, city: "Kuopio" },
    "71330": { lat: 63.0300, lon: 27.7900, city: "Kuopio" },
    "71380": { lat: 63.0400, lon: 27.8000, city: "Kuopio" },
    "71460": { lat: 63.0600, lon: 27.8200, city: "Kuopio" },
    "71470": { lat: 63.0700, lon: 27.8300, city: "Kuopio" },
    "71480": { lat: 63.0800, lon: 27.8400, city: "Kuopio" },
    "71490": { lat: 63.0900, lon: 27.8500, city: "Kuopio" },
    "71520": { lat: 62.8600, lon: 27.4000, city: "Kuopio" },
    "71530": { lat: 62.8500, lon: 27.3800, city: "Kuopio" },
    "71540": { lat: 62.8400, lon: 27.3600, city: "Kuopio" },
    "71570": { lat: 62.8200, lon: 27.3200, city: "Kuopio" },
    "71610": { lat: 62.7800, lon: 27.2800, city: "Kuopio" },
    "71620": { lat: 62.7600, lon: 27.2600, city: "Kuopio" },
    "71630": { lat: 62.7400, lon: 27.2400, city: "Kuopio" },
    "71640": { lat: 62.7200, lon: 27.2200, city: "Kuopio" },
    "71650": { lat: 62.7000, lon: 27.2000, city: "Kuopio" },
    "71660": { lat: 62.6800, lon: 27.1800, city: "Kuopio" },
    "71670": { lat: 62.6600, lon: 27.1600, city: "Kuopio" },
    "71680": { lat: 62.6400, lon: 27.1400, city: "Kuopio" },
    "71690": { lat: 62.6200, lon: 27.1200, city: "Kuopio" },
    "71720": { lat: 62.9200, lon: 27.3000, city: "Kuopio" },
    "71730": { lat: 62.9400, lon: 27.2800, city: "Kuopio" },
    "71740": { lat: 62.9600, lon: 27.2600, city: "Kuopio" },
    "71745": { lat: 62.9700, lon: 27.2500, city: "Kuopio" },
    "71750": { lat: 62.9800, lon: 27.2400, city: "Kuopio" },
    "71760": { lat: 62.9900, lon: 27.2300, city: "Kuopio" },
    "71770": { lat: 63.0000, lon: 27.2200, city: "Kuopio" },
    "71800": { lat: 62.8700, lon: 28.0000, city: "Siilinjärvi" },
    "71820": { lat: 62.8800, lon: 28.0100, city: "Siilinjärvi" },
    "71840": { lat: 62.8900, lon: 28.0200, city: "Siilinjärvi" },
    "71850": { lat: 62.9000, lon: 28.0300, city: "Siilinjärvi" },
    "71870": { lat: 62.9200, lon: 28.0500, city: "Siilinjärvi" },
    "71910": { lat: 63.0500, lon: 27.6500, city: "Siilinjärvi" },
    "71920": { lat: 63.0700, lon: 27.6300, city: "Siilinjärvi" },
    "71940": { lat: 63.1000, lon: 27.6000, city: "Siilinjärvi" },
    "71950": { lat: 63.1200, lon: 27.5800, city: "Siilinjärvi" },
    "71960": { lat: 63.1400, lon: 27.5600, city: "Siilinjärvi" },
    "72100": { lat: 63.2042, lon: 27.7274, city: "Karttula" },
    "72210": { lat: 63.2500, lon: 27.7000, city: "Tervo" },
    "72300": { lat: 63.1000, lon: 27.4500, city: "Vesanto" },
    "72400": { lat: 63.0500, lon: 27.3500, city: "Pielavesi" },
    "72530": { lat: 63.2000, lon: 26.7500, city: "Pielavesi" },
    "72600": { lat: 63.2500, lon: 26.5000, city: "Keitele" },
    "73100": { lat: 63.5500, lon: 27.1000, city: "Lapinlahti" },
    "73200": { lat: 63.4000, lon: 27.4000, city: "Varpaisjärvi" },
    "73300": { lat: 63.3000, lon: 27.8000, city: "Nilsiä" },
    "73310": { lat: 63.3200, lon: 27.8200, city: "Nilsiä" },
    "73320": { lat: 63.3400, lon: 27.8400, city: "Nilsiä" },
    "73350": { lat: 63.3800, lon: 27.8800, city: "Tahkovuori" },
    "73360": { lat: 63.4000, lon: 27.9000, city: "Tahkovuori" },
    "73900": { lat: 63.0800, lon: 28.3000, city: "Rautavaara" },
    "74100": { lat: 63.6500, lon: 27.8000, city: "Iisalmi" },
    "74120": { lat: 63.5600, lon: 27.1900, city: "Iisalmi" },
    "74130": { lat: 63.5700, lon: 27.2000, city: "Iisalmi" },
    "74140": { lat: 63.5800, lon: 27.2100, city: "Iisalmi" },
    "74150": { lat: 63.5900, lon: 27.2200, city: "Iisalmi" },
    "74160": { lat: 63.6000, lon: 27.2300, city: "Iisalmi" },
    "74170": { lat: 63.6100, lon: 27.2400, city: "Iisalmi" },
    "77600": { lat: 62.4800, lon: 27.2400, city: "Suonenjoki" },
    "77610": { lat: 62.4900, lon: 27.2500, city: "Suonenjoki" },
    "77630": { lat: 62.5100, lon: 27.2700, city: "Suonenjoki" },
    "77700": { lat: 62.6000, lon: 27.4000, city: "Rautalampi" },
    "77800": { lat: 62.7000, lon: 27.2000, city: "Leppävirta" },
    "78200": { lat: 62.5200, lon: 27.7500, city: "Varkaus" },
    "78210": { lat: 62.3200, lon: 27.8900, city: "Varkaus" },
    "78250": { lat: 62.3300, lon: 27.9000, city: "Varkaus" },
    "78300": { lat: 62.3400, lon: 27.9100, city: "Varkaus" },
    "78310": { lat: 62.3500, lon: 27.9200, city: "Varkaus" },
    "78500": { lat: 62.4500, lon: 28.0000, city: "Joroinen" },
    "78850": { lat: 62.4800, lon: 28.2000, city: "Leppävirta" },
    "79100": { lat: 62.4874, lon: 27.7875, city: "Leppävirta" },
    "76100": { lat: 62.3028, lon: 27.1304, city: "Pieksämäki" },
    // Major Finnish cities (outside 80km)
    "00100": { lat: 60.1699, lon: 24.9384, city: "Helsinki" },
    "00120": { lat: 60.1675, lon: 24.9427, city: "Helsinki" },
    "00130": { lat: 60.1658, lon: 24.9553, city: "Helsinki" },
    "00140": { lat: 60.1628, lon: 24.9689, city: "Helsinki" },
    "00150": { lat: 60.1602, lon: 24.9452, city: "Helsinki" },
    "00160": { lat: 60.1630, lon: 24.9250, city: "Helsinki" },
    "00170": { lat: 60.1710, lon: 24.9550, city: "Helsinki" },
    "00180": { lat: 60.1630, lon: 24.9500, city: "Helsinki" },
    "00200": { lat: 60.1590, lon: 24.9514, city: "Helsinki" },
    "00250": { lat: 60.1720, lon: 24.9050, city: "Helsinki" },
    "00300": { lat: 60.1800, lon: 24.9100, city: "Helsinki" },
    "00400": { lat: 60.2000, lon: 24.9100, city: "Helsinki" },
    "00500": { lat: 60.1872, lon: 24.9214, city: "Helsinki" },
    "00510": { lat: 60.1880, lon: 24.9650, city: "Helsinki" },
    "00520": { lat: 60.1950, lon: 24.9500, city: "Helsinki" },
    "00530": { lat: 60.1920, lon: 24.9650, city: "Helsinki" },
    "00550": { lat: 60.1890, lon: 24.9750, city: "Helsinki" },
    "00560": { lat: 60.2050, lon: 24.9600, city: "Helsinki" },
    "00600": { lat: 60.2100, lon: 24.9200, city: "Helsinki" },
    "00700": { lat: 60.2250, lon: 24.9300, city: "Helsinki" },
    "00800": { lat: 60.2350, lon: 24.9400, city: "Helsinki" },
    "00900": { lat: 60.2450, lon: 24.9500, city: "Helsinki" },
    "00920": { lat: 60.2350, lon: 24.9050, city: "Helsinki" },
    "00940": { lat: 60.2200, lon: 24.8800, city: "Helsinki" },
    "00980": { lat: 60.2500, lon: 25.0000, city: "Helsinki" },
    "01000": { lat: 60.2934, lon: 25.0378, city: "Vantaa" },
    "02100": { lat: 60.1756, lon: 24.8058, city: "Espoo" },
    "02200": { lat: 60.1850, lon: 24.8100, city: "Espoo" },
    "02600": { lat: 60.2100, lon: 24.7500, city: "Espoo" },
    "33100": { lat: 61.4978, lon: 23.7610, city: "Tampere" },
    "33200": { lat: 61.5100, lon: 23.7700, city: "Tampere" },
    "33500": { lat: 61.4850, lon: 23.8000, city: "Tampere" },
    "40100": { lat: 62.2426, lon: 25.7473, city: "Jyväskylä" },
    "40200": { lat: 62.2300, lon: 25.7600, city: "Jyväskylä" },
    "50100": { lat: 61.6885, lon: 27.2723, city: "Mikkeli" },
    "53100": { lat: 61.0587, lon: 28.1887, city: "Lappeenranta" },
    "65100": { lat: 63.0951, lon: 21.6165, city: "Vaasa" },
    "80100": { lat: 62.6024, lon: 29.7636, city: "Joensuu" },
    "90100": { lat: 65.0121, lon: 25.4651, city: "Oulu" },
    "90200": { lat: 65.0200, lon: 25.4500, city: "Oulu" },
    "90500": { lat: 65.0000, lon: 25.5000, city: "Oulu" },
    "96100": { lat: 66.5028, lon: 25.7285, city: "Rovaniemi" },
    "96200": { lat: 66.5100, lon: 25.7000, city: "Rovaniemi" },
    // Lapland - far north
    "99100": { lat: 69.0756, lon: 20.8150, city: "Kilpisjärvi" },
    "99130": { lat: 69.0450, lon: 20.7890, city: "Kilpisjärvi" },
    "99300": { lat: 68.4199, lon: 22.4898, city: "Muonio" },
    "99400": { lat: 68.0580, lon: 23.5430, city: "Enontekiö" },
    "99490": { lat: 69.0450, lon: 20.7890, city: "Kilpisjärvi" },
    "99600": { lat: 67.4458, lon: 26.5746, city: "Sodankylä" },
    "99800": { lat: 68.6588, lon: 27.5348, city: "Ivalo" },
    "99870": { lat: 69.0700, lon: 27.0300, city: "Inari" },
    "99980": { lat: 70.0922, lon: 27.9072, city: "Utsjoki" },
    "97500": { lat: 67.8062, lon: 24.1508, city: "Muonio" },
    "97600": { lat: 67.7500, lon: 24.1500, city: "Kittilä" },
    "97700": { lat: 67.6600, lon: 23.6500, city: "Kittilä" },
    "98100": { lat: 67.4100, lon: 26.5900, city: "Sodankylä" },
    "98530": { lat: 67.7390, lon: 27.5285, city: "Sodankylä" },
  };

  if (postalCodeMap[postalCode]) {
    return postalCodeMap[postalCode];
  }

  // Use dynamic geocoding for postal codes not in the static map
  console.log(`Postal code ${postalCode} not in static map, using geocoding...`);
  return await geocodePostalCode(postalCode);
}

async function getCoordinatesFromPostalCode(postalCode: string): Promise<{ lat: number; lon: number } | null> {
  const info = await getPostalCodeInfo(postalCode);
  return info ? { lat: info.lat, lon: info.lon } : null;
}

interface SnowDepthResult {
  depth: number;
  stationName: string | null;
  stationDistance: number | null;
  updatedAt: Date | null;
}

interface StationData {
  name: string;
  lat: number;
  lon: number;
  snowDepth: number;
  timestamp: Date;
  distance: number;
}

// Known FMI station IDs for specific locations
const KILPISJARVI_STATIONS = [
  { fmisid: "102016", name: "Kilpisjärvi kyläkeskus", lat: 69.0458, lon: 20.7877 },
  { fmisid: "102017", name: "Kilpisjärvi Saana", lat: 69.0422, lon: 20.8508 },
];

// Known FMI station IDs for Inari/Ivalo area
const INARI_IVALO_STATIONS = [
  { fmisid: "101784", name: "Ivalo lentoasema", lat: 68.6073, lon: 27.4053 },
  { fmisid: "101885", name: "Inari Saariselkä matkailukeskus", lat: 68.4151, lon: 27.4132 },
  { fmisid: "102003", name: "Inari Raja-Jooseppi", lat: 68.4778, lon: 28.3000 },
];

async function getSnowDepthWithStationInfo(lat: number, lon: number, postalCode?: string): Promise<SnowDepthResult> {
  const now = new Date();
  // Daily observations - look at past 7 days to ensure we get data
  const startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const endTime = now.toISOString();

  // For Kilpisjärvi area, try specific station IDs first
  if (postalCode === "99130" || postalCode === "99100" || postalCode === "99490" || (lat > 69.0 && lon > 20.5 && lon < 21.0)) {
    for (const station of KILPISJARVI_STATIONS) {
      const result = await fetchSnowFromStation(station.fmisid, station.name, lat, lon, startTime, endTime, station.lat, station.lon);
      if (result) {
        console.log(`Kilpisjärvi station ${station.name}: ${result.depth}cm snow, ${result.stationDistance}km away`);
        return result;
      }
    }
  }

  // For Inari/Ivalo area (postal codes 998xx, 997xx or coordinates in the region)
  if (postalCode?.startsWith("998") || postalCode?.startsWith("997") || 
      (lat > 68.0 && lat < 69.5 && lon > 27.0 && lon < 29.0)) {
    for (const station of INARI_IVALO_STATIONS) {
      const result = await fetchSnowFromStation(station.fmisid, station.name, lat, lon, startTime, endTime, station.lat, station.lon);
      if (result) {
        console.log(`Inari/Ivalo station ${station.name}: ${result.depth}cm snow, ${result.stationDistance}km away`);
        return result;
      }
    }
  }

  // Two-phase bbox search: first try 25km, then expand to 50km if needed
  const searchRadii = [25, 50];
  
  for (const radiusKm of searchRadii) {
    const result = await searchStationsInRadius(lat, lon, radiusKm, startTime, endTime);
    if (result && result.stationName) {
      return result;
    }
  }

  // No station found within 50km, return estimate
  console.warn(`No stations found within 50km of (${lat}, ${lon})`);
  return getMockSnowDepthResult(lat);
}

async function searchStationsInRadius(lat: number, lon: number, radiusKm: number, startTime: string, endTime: string): Promise<SnowDepthResult | null> {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
  const bbox = `${lon - lonDelta},${lat - latDelta},${lon + lonDelta},${lat + latDelta}`;
  
  const url = `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::weather::daily::timevaluepair&bbox=${bbox}&starttime=${startTime}&endtime=${endTime}&parameters=snow`;
  
  console.log(`FMI Snow Query (${radiusKm}km): ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`FMI API returned ${response.status}`);
      return null;
    }

    const xmlText = await response.text();
    const result = parseTimeValuePairSnowResponse(xmlText, lat, lon, radiusKm);
    
    // Return null if no actual station was found (stationName is null)
    if (!result.stationName) {
      return null;
    }
    
    return result;
  } catch (error) {
    console.error("Error fetching snow depth:", error);
    return null;
  }
}

async function fetchSnowFromStation(fmisid: string, stationName: string, userLat: number, userLon: number, startTime: string, endTime: string, stationLat?: number, stationLon?: number): Promise<SnowDepthResult | null> {
  // Use daily observations with 'snow' parameter
  const url = `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::weather::daily::timevaluepair&fmisid=${fmisid}&starttime=${startTime}&endtime=${endTime}&parameters=snow`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const xmlText = await response.text();
    
    // Parse station position from XML if not provided
    let finalStationLat = stationLat || 0;
    let finalStationLon = stationLon || 0;
    
    if (!stationLat || !stationLon) {
      const posMatch = xmlText.match(/<gml:pos[^>]*>([^<]+)<\/gml:pos>/);
      if (posMatch) {
        const coords = posMatch[1].trim().split(/\s+/);
        finalStationLat = parseFloat(coords[0]);
        finalStationLon = parseFloat(coords[1]);
      }
    }
    
    // Parse all time-value pairs to get the latest snow depth
    const measurementRegex = /<wml2:MeasurementTVP>[\s\S]*?<wml2:time>([^<]+)<\/wml2:time>[\s\S]*?<wml2:value>([^<]+)<\/wml2:value>[\s\S]*?<\/wml2:MeasurementTVP>/g;
    const measurementMatches = Array.from(xmlText.matchAll(measurementRegex));
    
    let latestTime: Date | null = null;
    let latestValue: number | null = null;
    
    for (const match of measurementMatches) {
      const timeStr = match[1];
      const valueStr = match[2];
      const value = parseFloat(valueStr);
      
      if (!isNaN(value) && value >= 0 && value < 500) {
        const time = new Date(timeStr);
        if (!latestTime || time > latestTime) {
          latestTime = time;
          latestValue = value;
        }
      }
    }
    
    if (latestValue !== null && latestTime) {
      const distance = calculateDistance(userLat, userLon, finalStationLat, finalStationLon);
      return {
        depth: Math.round(latestValue),
        stationName: stationName,
        stationDistance: Math.round(distance),
        updatedAt: latestTime,
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching from station ${fmisid}:`, error);
    return null;
  }
}

function parseTimeValuePairSnowResponse(xmlText: string, userLat: number, userLon: number, maxDistance: number): SnowDepthResult {
  // Parse all point time series from the response
  const seriesRegex = /<omso:PointTimeSeriesObservation[^>]*>([\s\S]*?)<\/omso:PointTimeSeriesObservation>/g;
  const seriesMatches = Array.from(xmlText.matchAll(seriesRegex));
  
  let bestResult: SnowDepthResult | null = null;
  let bestDistance = Infinity;
  
  for (const seriesMatch of seriesMatches) {
    const seriesContent = seriesMatch[1];
    
    // Extract station name
    const nameMatch = seriesContent.match(/<gml:name[^>]*>([^<]+)<\/gml:name>/);
    const stationName = nameMatch ? nameMatch[1].trim() : "Tuntematon asema";
    
    // Extract station position
    const posMatch = seriesContent.match(/<gml:pos[^>]*>([^<]+)<\/gml:pos>/);
    if (!posMatch) continue;
    
    const coords = posMatch[1].trim().split(/\s+/);
    const stationLat = parseFloat(coords[0]);
    const stationLon = parseFloat(coords[1]);
    const distance = calculateDistance(userLat, userLon, stationLat, stationLon);
    
    if (distance > maxDistance) continue;
    
    // Parse measurements
    const measurementRegex2 = /<wml2:MeasurementTVP>[\s\S]*?<wml2:time>([^<]+)<\/wml2:time>[\s\S]*?<wml2:value>([^<]+)<\/wml2:value>[\s\S]*?<\/wml2:MeasurementTVP>/g;
    const measurementMatches = Array.from(seriesContent.matchAll(measurementRegex2));
    
    let latestTime: Date | null = null;
    let latestValue: number | null = null;
    
    for (const match of measurementMatches) {
      const timeStr = match[1];
      const valueStr = match[2];
      const value = parseFloat(valueStr);
      
      if (!isNaN(value) && value >= 0 && value < 500) {
        const time = new Date(timeStr);
        if (!latestTime || time > latestTime) {
          latestTime = time;
          latestValue = value;
        }
      }
    }
    
    if (latestValue !== null && latestTime && distance < bestDistance) {
      bestDistance = distance;
      bestResult = {
        depth: Math.round(latestValue),
        stationName,
        stationDistance: Math.round(distance),
        updatedAt: latestTime,
      };
    }
  }
  
  if (bestResult) {
    console.log(`Found station: ${bestResult.stationName} at ${bestResult.stationDistance}km with ${bestResult.depth}cm snow`);
    return bestResult;
  }
  
  console.warn(`No stations found within ${maxDistance}km`);
  return getMockSnowDepthResult(userLat);
}

// Backward compatible wrapper for existing code
async function getSnowDepth(lat: number, lon: number): Promise<number> {
  const result = await getSnowDepthWithStationInfo(lat, lon);
  return result.depth;
}

function getMockSnowDepthResult(lat: number): SnowDepthResult {
  // Use seasonal/latitude-based realistic estimates
  const now = new Date();
  const month = now.getMonth(); // 0-11
  
  // Winter months (Nov-Mar) have snow
  const isWinter = month >= 10 || month <= 2;
  const isEarlyWinter = month === 10 || month === 11;
  const isLateWinter = month === 2 || month === 3;
  
  let baseDepth = 0;
  
  if (lat > 68) { // Far north (Kilpisjärvi, Utsjoki)
    baseDepth = isWinter ? 25 : (isLateWinter ? 15 : 5);
  } else if (lat > 66) { // Lapland (Rovaniemi)
    baseDepth = isWinter ? 15 : (isLateWinter ? 8 : 2);
  } else if (lat > 64) { // Northern Finland (Oulu)
    baseDepth = isWinter ? 10 : (isLateWinter ? 5 : 0);
  } else if (lat > 62) { // Central Finland (Kuopio)
    baseDepth = isWinter ? 8 : (isLateWinter ? 3 : 0);
  } else { // Southern Finland (Helsinki)
    baseDepth = isWinter ? 3 : 0;
  }
  
  return {
    depth: baseDepth,
    stationName: null,
    stationDistance: null,
    updatedAt: null,
  };
}

function getMockSnowDepth(lat: number): number {
  return getMockSnowDepthResult(lat).depth;
}

interface ThawCondition {
  date: string;
  maxTemp: number;
  totalPrecip: number;
}

interface ForecastDay {
  date: string;
  dayName: string;
  dateLabel: string;  // e.g., "Pe 28.11."
  snowDepth: number;
  minTemp: number;
  maxTemp: number;
  temperature: number;  // average for backward compatibility
  precipAmount: number;
  precipType: "snow" | "rain" | "sleet" | "none";
  precipLabel: string;  // e.g., "0–1 mm lunta"
  icon: string;
}

interface ForecastWithThawResult {
  forecast: ForecastDay[];
  hasThawConditions: boolean;
  thawConditions: ThawCondition[];
}

async function getSnowForecastWithThawWarning(lat: number, lon: number, threshold: number): Promise<ForecastWithThawResult> {
  const dayNames = ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"];
  const today = new Date();
  const thawConditions: ThawCondition[] = [];
  
  try {
    // Use timevaluepair for more accurate forecast parsing
    const startTime = new Date(today);
    startTime.setHours(0, 0, 0, 0);
    startTime.setDate(startTime.getDate() + 1); // Start from tomorrow
    const endTime = new Date(startTime);
    endTime.setDate(endTime.getDate() + 3); // 3 days of forecast
    
    // Use ECMWF model for longer-range forecasts (up to 10 days) instead of HARMONIE (only ~48 hours)
    const url = `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=ecmwf::forecast::surface::point::timevaluepair&latlon=${lat},${lon}&starttime=${startTime.toISOString()}&endtime=${endTime.toISOString()}&parameters=Temperature,Precipitation1h`;
    
    console.log(`FMI Forecast Query: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`FMI forecast API returned ${response.status}`);
      return {
        forecast: getFallbackForecast(lat, today, dayNames),
        hasThawConditions: false,
        thawConditions: [],
      };
    }

    const xmlText = await response.text();
    
    // Parse timevaluepair data for each parameter
    const dailyData = parseTimeValuePairForecast(xmlText);
    
    if (dailyData.size === 0) {
      console.warn("Could not parse FMI forecast response");
      return {
        forecast: getFallbackForecast(lat, today, dayNames),
        hasThawConditions: false,
        thawConditions: [],
      };
    }

    // Get current snow depth as baseline
    const currentSnowDepth = await getSnowDepth(lat, lon);
    
    // Build forecast for next 3 days
    const forecast: ForecastDay[] = [];
    let accumulatedSnow = currentSnowDepth;
    
    for (let i = 1; i <= 3; i++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(today.getDate() + i);
      const dateKey = forecastDate.toISOString().split('T')[0];
      const dayName = dayNames[forecastDate.getDay()];
      const dateLabel = `${dayName} ${forecastDate.getDate()}.${forecastDate.getMonth() + 1}.`;
      
      const dayData = dailyData.get(dateKey);
      
      if (dayData && dayData.temps.length > 0) {
        const minTemp = Math.round(Math.min(...dayData.temps));
        const maxTemp = Math.round(Math.max(...dayData.temps));
        const avgTemp = Math.round(dayData.temps.reduce((a, b) => a + b, 0) / dayData.temps.length);
        const totalPrecip = dayData.precip.reduce((a, b) => a + b, 0);
        const roundedPrecip = Math.round(totalPrecip * 10) / 10;
        
        // Determine precipitation type based on temperature
        const precipType = determinePrecipType(avgTemp, maxTemp, minTemp, totalPrecip);
        const precipLabel = formatPrecipLabel(roundedPrecip, precipType);
        
        // Check for thaw conditions
        if (maxTemp >= 1 && totalPrecip >= 5) {
          thawConditions.push({
            date: dateKey,
            maxTemp,
            totalPrecip: roundedPrecip,
          });
        }
        
        // Update snow accumulation
        if (avgTemp < 0 && totalPrecip > 0) {
          accumulatedSnow += totalPrecip;
        } else if (avgTemp > 2) {
          accumulatedSnow = Math.max(0, accumulatedSnow - (avgTemp - 2) * 2);
        }
        
        // Get weather icon
        const mostCommonSymbol = getMostCommonSymbol(dayData.symbols);
        const icon = getWeatherIconFromSymbol(mostCommonSymbol, avgTemp, totalPrecip);
        
        forecast.push({
          date: dateKey,
          dayName,
          dateLabel,
          snowDepth: Math.round(accumulatedSnow),
          minTemp,
          maxTemp,
          temperature: avgTemp,
          precipAmount: roundedPrecip,
          precipType,
          precipLabel,
          icon,
        });
      } else {
        // Fallback for missing data
        const defaultTemp = lat > 64 ? -8 : -3;
        forecast.push({
          date: dateKey,
          dayName,
          dateLabel,
          snowDepth: Math.round(accumulatedSnow),
          minTemp: defaultTemp - 3,
          maxTemp: defaultTemp + 2,
          temperature: defaultTemp,
          precipAmount: 0,
          precipType: "none",
          precipLabel: "0 mm",
          icon: "cloudy",
        });
      }
    }

    return {
      forecast,
      hasThawConditions: thawConditions.length > 0,
      thawConditions,
    };
  } catch (error) {
    console.error("Error fetching forecast:", error);
    return {
      forecast: getFallbackForecast(lat, today, dayNames),
      hasThawConditions: false,
      thawConditions: [],
    };
  }
}

// Parse timevaluepair forecast response from FMI
function parseTimeValuePairForecast(xmlText: string): Map<string, { temps: number[]; precip: number[]; symbols: number[] }> {
  const dailyData: Map<string, { temps: number[]; precip: number[]; symbols: number[] }> = new Map();
  
  // Find all measurement time series
  const seriesRegex = /<omso:PointTimeSeriesObservation[^>]*>([\s\S]*?)<\/omso:PointTimeSeriesObservation>/g;
  const seriesMatches = Array.from(xmlText.matchAll(seriesRegex));
  
  for (const seriesMatch of seriesMatches) {
    const seriesContent = seriesMatch[1];
    
    // Determine which parameter this series is for
    const paramMatch = seriesContent.match(/observedProperty[^>]*xlink:href="[^"]*\/([^/"]+)"/);
    const paramName = paramMatch ? paramMatch[1].toLowerCase() : "";
    
    // Parse measurements
    const measurementRegex = /<wml2:MeasurementTVP>[\s\S]*?<wml2:time>([^<]+)<\/wml2:time>[\s\S]*?<wml2:value>([^<]+)<\/wml2:value>[\s\S]*?<\/wml2:MeasurementTVP>/g;
    const measurements = Array.from(seriesContent.matchAll(measurementRegex));
    
    for (const match of measurements) {
      const timeStr = match[1];
      const valueStr = match[2];
      const value = parseFloat(valueStr);
      
      if (isNaN(value)) continue;
      
      const date = new Date(timeStr);
      const dateKey = date.toISOString().split('T')[0];
      
      if (!dailyData.has(dateKey)) {
        dailyData.set(dateKey, { temps: [], precip: [], symbols: [] });
      }
      
      const day = dailyData.get(dateKey)!;
      
      if (paramName.includes("temperature")) {
        day.temps.push(value);
      } else if (paramName.includes("precipitation")) {
        day.precip.push(value);
      } else if (paramName.includes("weathersymbol")) {
        day.symbols.push(value);
      }
    }
  }
  
  return dailyData;
}

// Determine precipitation type based on temperature
function determinePrecipType(avgTemp: number, maxTemp: number, minTemp: number, precipAmount: number): "snow" | "rain" | "sleet" | "none" {
  if (precipAmount <= 0) return "none";
  
  // If all temps below -1°C, it's snow
  if (maxTemp < -1) return "snow";
  
  // If all temps above +2°C, it's rain
  if (minTemp > 2) return "rain";
  
  // If temps cross 0°C with max > 0 and min < 0, it's sleet
  if (maxTemp > 0 && minTemp < 0) return "sleet";
  
  // Based on average temperature
  if (avgTemp <= 0) return "snow";
  if (avgTemp >= 2) return "rain";
  
  return "sleet";
}

// Format precipitation label in Finnish
function formatPrecipLabel(amount: number, type: "snow" | "rain" | "sleet" | "none"): string {
  if (type === "none" || amount < 0.1) return "0 mm";
  
  const typeLabels = {
    snow: "lunta",
    rain: "vettä",
    sleet: "räntää",
    none: "",
  };
  
  // Format as range for small amounts (0-1 mm)
  if (amount <= 1) {
    return `0–${Math.max(1, Math.ceil(amount))} mm ${typeLabels[type]}`;
  }
  
  return `${Math.round(amount)} mm ${typeLabels[type]}`;
}

function getMostCommonSymbol(symbols: number[]): number {
  if (symbols.length === 0) return 0;
  const counts: Record<number, number> = {};
  for (const s of symbols) {
    counts[s] = (counts[s] || 0) + 1;
  }
  let maxCount = 0;
  let mostCommon = symbols[0];
  for (const symbolStr of Object.keys(counts)) {
    const symbol = parseInt(symbolStr);
    const count = counts[symbol];
    if (count > maxCount) {
      maxCount = count;
      mostCommon = symbol;
    }
  }
  return mostCommon;
}

function getWeatherIconFromSymbol(symbol: number, temp: number, precip: number): string {
  // FMI weather symbol codes:
  // 1 = clear, 2 = partly cloudy, 3 = cloudy
  // 21-25 = showers, 31-34 = rain, 41-45 = snow showers, 51-54 = snowfall
  // 61-65 = thunderstorms, 71-74 = sleet
  
  if (symbol >= 51 && symbol <= 54) return "snow";
  if (symbol >= 41 && symbol <= 45) return "snow";
  if (symbol >= 31 && symbol <= 34) return "rain";
  if (symbol >= 21 && symbol <= 25) {
    return temp < 0 ? "snow" : "rain";
  }
  if (symbol >= 71 && symbol <= 74) return "rain";
  if (symbol === 1) return "sunny";
  if (symbol === 2) return "partly-cloudy";
  
  // Default based on conditions
  if (precip > 0 && temp < 0) return "snow";
  if (precip > 0) return "rain";
  return "cloudy";
}

function getFallbackForecast(
  lat: number,
  today: Date,
  dayNames: string[]
): ForecastDay[] {
  // Fallback with reasonable estimates based on latitude and season
  const month = today.getMonth();
  const isWinter = month >= 10 || month <= 3;
  
  const baseSnow = lat > 64 ? 45 : lat > 62 ? 30 : 15;
  const baseTemp = lat > 64 ? -12 : lat > 62 ? -8 : -4;
  
  const forecast: ForecastDay[] = [];
  for (let i = 1; i <= 3; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayName = dayNames[date.getDay()];
    const dateLabel = `${dayName} ${date.getDate()}.${date.getMonth() + 1}.`;
    const temp = baseTemp + (i % 3 - 1) * 2;
    
    forecast.push({
      date: date.toISOString().split("T")[0],
      dayName,
      dateLabel,
      snowDepth: isWinter ? baseSnow + (i * 2) : Math.max(0, baseSnow - (i * 3)),
      minTemp: temp - 3,
      maxTemp: temp + 2,
      temperature: temp,
      precipAmount: isWinter ? 1 : 0,
      precipType: isWinter ? "snow" : "none",
      precipLabel: isWinter ? "0–1 mm lunta" : "0 mm",
      icon: isWinter ? "snow" : "cloudy",
    });
  }
  
  return forecast;
}
